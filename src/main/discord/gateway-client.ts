import WebSocket from 'ws';
import { GatewayOpcode, type DiscordMessage, type GatewayPayload, type ReadyEvent } from './types';

const GATEWAY_URL = 'wss://gateway.discord.gg';
const GATEWAY_QUERY = '?v=9&encoding=json';
// GUILD_MESSAGES | MESSAGE_CONTENT
const INTENTS = (1 << 9) | (1 << 15);

const MIN_RECONNECT_DELAY_MS = 1_000;
const MAX_RECONNECT_DELAY_MS = 30_000;
/** Client-side close code: drop the socket but keep the session resumable. */
const RESUMABLE_CLOSE_CODE = 4000;

/** Close codes after which reconnecting cannot help. */
const FATAL_CLOSE_CODES: Record<number, string> = {
  4004: 'Authentication failed — the Discord token is invalid',
  4010: 'Invalid shard',
  4011: 'Sharding required',
  4012: 'Invalid gateway API version',
  4013: 'Invalid intents',
  4014: 'Disallowed intents',
};
/** Close codes after which the session cannot be resumed. */
const SESSION_RESET_CLOSE_CODES = new Set([4007, 4009]);

export type GatewayState = 'connecting' | 'connected' | 'reconnecting';

export interface GatewayListener {
  onStateChange(state: GatewayState): void;
  onMessageUpdate(message: DiscordMessage): void;
  /** Recoverable error; the client reconnects on its own. */
  onError(message: string): void;
  /** Unrecoverable error; the client has stopped. */
  onFatalError(message: string): void;
}

export interface Gateway {
  start(): void;
  stop(): void;
}

/**
 * Minimal Discord Gateway client: heartbeats with zombie detection,
 * session resume and exponential reconnect backoff.
 */
export class GatewayClient implements Gateway {
  private ws: WebSocket | null = null;
  private stopped = true;

  private heartbeatTimer: NodeJS.Timeout | null = null;
  private heartbeatAcked = true;

  private reconnectTimer: NodeJS.Timeout | null = null;
  private reconnectAttempts = 0;

  private sequence: number | null = null;
  private sessionId: string | null = null;
  private resumeUrl: string | null = null;

  constructor(
    private readonly token: string,
    private readonly listener: GatewayListener,
  ) {}

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.clearReconnectTimer();
    this.dropSocket();
    this.resetSession();
  }

  private open(): void {
    this.listener.onStateChange(this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting');

    const base = this.canResume() && this.resumeUrl ? this.resumeUrl : GATEWAY_URL;
    const ws = new WebSocket(`${base}/${GATEWAY_QUERY}`);
    this.ws = ws;

    ws.on('message', (raw) => {
      if (ws !== this.ws) return;
      let payload: GatewayPayload;
      try {
        payload = JSON.parse(raw.toString()) as GatewayPayload;
      } catch {
        return;
      }
      this.handlePayload(payload);
    });
    ws.on('close', (code) => {
      if (ws === this.ws) this.handleClose(code);
    });
    ws.on('error', (err) => {
      // A 'close' event always follows, so only report here.
      if (ws === this.ws) this.listener.onError(`Gateway: ${err.message}`);
    });
  }

  private handlePayload({ op, d, s, t }: GatewayPayload): void {
    if (typeof s === 'number') this.sequence = s;

    switch (op) {
      case GatewayOpcode.Hello:
        this.startHeartbeat((d as { heartbeat_interval: number }).heartbeat_interval);
        if (this.canResume()) this.resume();
        else this.identify();
        break;
      case GatewayOpcode.HeartbeatAck:
        this.heartbeatAcked = true;
        break;
      case GatewayOpcode.Heartbeat:
        this.sendHeartbeat();
        break;
      case GatewayOpcode.Reconnect:
        this.reconnect(0);
        break;
      case GatewayOpcode.InvalidSession:
        if (d !== true) this.resetSession();
        // Discord asks clients to wait 1–5 seconds before re-identifying.
        this.reconnect(1_000 + Math.random() * 4_000);
        break;
      case GatewayOpcode.Dispatch:
        this.handleDispatch(t, d);
        break;
    }
  }

  private handleDispatch(type: string | null, data: unknown): void {
    switch (type) {
      case 'READY': {
        const ready = data as ReadyEvent;
        this.sessionId = ready.session_id;
        this.resumeUrl = ready.resume_gateway_url;
        this.markConnected();
        break;
      }
      case 'RESUMED':
        this.markConnected();
        break;
      case 'MESSAGE_UPDATE':
        this.listener.onMessageUpdate(data as DiscordMessage);
        break;
    }
  }

  private handleClose(code: number): void {
    this.dropSocket();
    if (this.stopped) return;

    const fatal = FATAL_CLOSE_CODES[code];
    if (fatal) {
      this.stop();
      this.listener.onFatalError(`${fatal} (close code ${code})`);
      return;
    }
    if (SESSION_RESET_CLOSE_CODES.has(code)) this.resetSession();
    this.scheduleReconnect(this.nextBackoffDelay());
  }

  private markConnected(): void {
    this.reconnectAttempts = 0;
    this.listener.onStateChange('connected');
  }

  /** Drops the current socket and opens a new one after `delayMs`. */
  private reconnect(delayMs: number): void {
    this.dropSocket(RESUMABLE_CLOSE_CODE);
    this.scheduleReconnect(delayMs);
  }

  private scheduleReconnect(delayMs: number): void {
    if (this.stopped) return;
    this.clearReconnectTimer();
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.stopped) this.open();
    }, delayMs);
  }

  private nextBackoffDelay(): number {
    return Math.min(MIN_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts, MAX_RECONNECT_DELAY_MS);
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatAcked = true;

    const beat = (): void => {
      if (!this.heartbeatAcked) {
        // No ACK since the previous beat: the connection is a zombie.
        this.listener.onError('Gateway: heartbeat not acknowledged, reconnecting');
        this.reconnect(0);
        return;
      }
      this.heartbeatAcked = false;
      this.sendHeartbeat();
      this.heartbeatTimer = setTimeout(beat, intervalMs);
    };
    // The first beat is jittered, as the Gateway docs require.
    this.heartbeatTimer = setTimeout(beat, intervalMs * Math.random());
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearTimeout(this.heartbeatTimer);
    this.heartbeatTimer = null;
  }

  private sendHeartbeat(): void {
    this.send({ op: GatewayOpcode.Heartbeat, d: this.sequence });
  }

  private identify(): void {
    this.send({
      op: GatewayOpcode.Identify,
      d: {
        token: this.token,
        intents: INTENTS,
        properties: { $os: process.platform, $browser: 'discord.py-self', $device: 'pc' },
      },
    });
  }

  private resume(): void {
    this.send({
      op: GatewayOpcode.Resume,
      d: { token: this.token, session_id: this.sessionId, seq: this.sequence },
    });
  }

  private send(payload: { op: number; d: unknown }): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }

  private canResume(): boolean {
    return this.sessionId !== null && this.sequence !== null;
  }

  private resetSession(): void {
    this.sessionId = null;
    this.resumeUrl = null;
    this.sequence = null;
  }

  private dropSocket(code = 1000): void {
    this.stopHeartbeat();
    const ws = this.ws;
    this.ws = null;
    if (!ws) return;
    ws.removeAllListeners();
    ws.on('error', () => {});
    if (ws.readyState === WebSocket.OPEN) ws.close(code);
    else ws.terminate();
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }
}

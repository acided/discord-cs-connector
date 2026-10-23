import net from 'node:net';
import type { NetConState, NetConStatus } from '../../shared/types';

const NETCON_HOST = '127.0.0.1';
const RETRY_DELAY_MS = 5_000;

/**
 * Persistent TCP connection to the CS2 console (`-netconport`).
 * CS2 may start after this app, so the client retries until stopped.
 */
export class NetConClient {
  private socket: net.Socket | null = null;
  private retryTimer: NodeJS.Timeout | null = null;
  private running = false;
  private state: NetConState = 'disconnected';
  private attempt = 0;

  constructor(
    private port: number,
    private readonly onStatus: (status: NetConStatus) => void,
  ) {}

  get status(): NetConStatus {
    return { state: this.state, port: this.port, attempt: this.attempt };
  }

  get isConnected(): boolean {
    return this.state === 'connected';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.connect();
  }

  stop(): void {
    this.running = false;
    this.clearRetryTimer();
    this.destroySocket();
    this.setState('disconnected');
  }

  setPort(port: number): void {
    if (port === this.port) return;
    this.port = port;
    this.attempt = 0;
    if (!this.running) return;
    this.clearRetryTimer();
    this.destroySocket();
    this.connect();
  }

  /** Writes a console command; returns false when CS2 is not reachable. */
  send(command: string): boolean {
    if (!this.isConnected || !this.socket?.writable) return false;
    try {
      this.socket.write(command.endsWith('\n') ? command : `${command}\n`);
      return true;
    } catch {
      return false;
    }
  }

  private connect(): void {
    this.attempt++;
    this.setState('connecting');

    const socket = net.createConnection({ host: NETCON_HOST, port: this.port });
    this.socket = socket;
    socket.setNoDelay(true);

    socket.on('connect', () => {
      if (socket !== this.socket) return;
      this.attempt = 0;
      this.setState('connected');
    });
    // CS2 streams its console output; discard it so the socket buffer never fills up.
    socket.on('data', () => {});
    socket.on('error', () => {
      // 'close' follows and handles the retry.
    });
    socket.on('close', () => {
      if (socket !== this.socket) return;
      this.socket = null;
      // A failed attempt keeps the 'connecting' state; only a dropped session counts as a disconnect.
      if (this.state === 'connected') this.setState('disconnected');
      this.scheduleRetry();
    });
  }

  private scheduleRetry(): void {
    if (!this.running) return;
    this.clearRetryTimer();
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.running) this.connect();
    }, RETRY_DELAY_MS);
  }

  private setState(state: NetConState): void {
    const changed = state !== this.state;
    this.state = state;
    // Repeated 'connecting' is still reported so the attempt counter stays fresh.
    if (changed || state === 'connecting') this.onStatus(this.status);
  }

  private destroySocket(): void {
    const socket = this.socket;
    this.socket = null;
    socket?.destroy();
  }

  private clearRetryTimer(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }
}

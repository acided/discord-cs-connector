import type { AppEvent } from '../../shared/events';
import { errorMessage, fail, ok, type Result } from '../../shared/result';
import type { ConnectInfo, LaunchOutcome, LaunchTrigger, MessageSource, MonitorState } from '../../shared/types';
import type { Gateway, GatewayListener } from '../discord/gateway-client';
import type { FetchMessage } from '../discord/rest-client';
import type { DiscordMessage } from '../discord/types';
import type { GameLauncher } from '../game/game-launcher';
import { isSameServer, parseConnect } from './connect-parser';

export interface MonitorTarget {
  token: string;
  channelId: string;
  messageId: string;
}

export interface MonitorDeps {
  fetchMessage: FetchMessage;
  createGateway: (token: string, listener: GatewayListener) => Gateway;
  launcher: Pick<GameLauncher, 'launch'>;
  emit: (event: AppEvent) => void;
}

/**
 * Watches one Discord message and auto-launches CS2 whenever a new server appears in it.
 *
 * Flow: a REST snapshot validates the target and catches an already-posted server,
 * then the Gateway streams edits. Every (re)connect re-fetches the snapshot so edits
 * made while the Gateway was down are not missed.
 */
export class MonitorService {
  private gateway: Gateway | null = null;
  private target: MonitorTarget | null = null;
  /** Bumped on every start/stop so stale async work can detect it was superseded. */
  private generation = 0;

  private lastConnect: ConnectInfo | null = null;
  /** Edit time of the newest message version seen; older versions are ignored. */
  private lastVersion = 0;

  constructor(private readonly deps: MonitorDeps) {}

  get isRunning(): boolean {
    return this.target !== null;
  }

  async start(target: MonitorTarget): Promise<Result> {
    this.stop({ silent: true });
    const generation = ++this.generation;
    this.target = target;
    this.emitState('connecting');

    let snapshot: DiscordMessage;
    try {
      snapshot = await this.deps.fetchMessage(target.token, target.channelId, target.messageId);
    } catch (err) {
      // A stop() during the fetch already emitted 'idle'; cancellation is not an error.
      if (generation !== this.generation) return ok();
      const message = errorMessage(err);
      this.target = null;
      this.emitState('error', message);
      return fail(message);
    }
    if (generation !== this.generation) return ok();

    this.handleMessage(snapshot, 'snapshot');
    this.gateway = this.deps.createGateway(target.token, this.createGatewayListener(generation));
    this.gateway.start();
    return ok();
  }

  stop({ silent = false } = {}): void {
    this.generation++;
    this.gateway?.stop();
    this.gateway = null;
    const wasRunning = this.target !== null;
    this.target = null;
    this.lastConnect = null;
    this.lastVersion = 0;
    if (wasRunning && !silent) this.emitState('idle');
  }

  async launchLast(): Promise<Result<LaunchOutcome>> {
    if (!this.lastConnect) return fail('No server detected yet');
    return this.launch(this.lastConnect, 'manual');
  }

  private createGatewayListener(generation: number): GatewayListener {
    const isCurrent = (): boolean => generation === this.generation;
    return {
      onStateChange: (state) => {
        if (!isCurrent()) return;
        if (state === 'connected') {
          this.emitState('listening');
          void this.resync(generation);
        } else {
          this.emitState(state);
        }
      },
      onMessageUpdate: (message) => {
        if (!isCurrent() || !this.isTargetMessage(message)) return;
        this.handleMessage(message, 'gateway');
      },
      onError: (message) => {
        if (isCurrent()) this.deps.emit({ type: 'warning', message });
      },
      onFatalError: (message) => {
        if (!isCurrent()) return;
        this.stop({ silent: true });
        this.emitState('error', message);
      },
    };
  }

  private async resync(generation: number): Promise<void> {
    const target = this.target;
    if (!target) return;
    try {
      const message = await this.deps.fetchMessage(target.token, target.channelId, target.messageId);
      if (generation === this.generation) this.handleMessage(message, 'snapshot');
    } catch (err) {
      if (generation === this.generation) {
        this.deps.emit({ type: 'warning', message: `Resync failed: ${errorMessage(err)}` });
      }
    }
  }

  private isTargetMessage(message: DiscordMessage): boolean {
    return message.id === this.target?.messageId && message.channel_id === this.target.channelId;
  }

  private handleMessage(message: DiscordMessage, source: MessageSource): void {
    const version = messageVersion(message);
    // Partial gateway updates (e.g. embed unfurls) carry no timestamp; treat them as newest.
    if (version !== null) {
      if (version < this.lastVersion) return;
      this.lastVersion = version;
    }

    const connect = parseConnect(message);
    if (!connect) {
      if (source === 'gateway') this.deps.emit({ type: 'message-updated', result: 'no-connect' });
      return;
    }
    if (this.lastConnect && isSameServer(this.lastConnect, connect)) {
      if (source === 'gateway') this.deps.emit({ type: 'message-updated', result: 'unchanged' });
      return;
    }

    this.lastConnect = connect;
    this.deps.emit({ type: 'connect-found', connect, source });
    void this.launch(connect, 'auto');
  }

  private async launch(connect: ConnectInfo, trigger: LaunchTrigger): Promise<Result<LaunchOutcome>> {
    try {
      const outcome = await this.deps.launcher.launch(connect);
      this.deps.emit({ type: 'launch', outcome, trigger, connect });
      return ok(outcome);
    } catch (err) {
      const message = `Launch failed: ${errorMessage(err)}`;
      this.deps.emit({ type: 'warning', message });
      return fail(message);
    }
  }

  private emitState(state: MonitorState, detail?: string): void {
    this.deps.emit({ type: 'monitor-state', state, detail });
  }
}

function messageVersion(message: DiscordMessage): number | null {
  const stamp = message.edited_timestamp ?? message.timestamp;
  if (!stamp) return null;
  const time = Date.parse(stamp);
  return Number.isNaN(time) ? null : time;
}

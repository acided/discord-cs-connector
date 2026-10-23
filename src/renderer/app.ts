import type { RendererApi } from '../shared/api';
import type { AppEvent } from '../shared/events';
import type { ConnectInfo, LaunchOutcome, LaunchTrigger, MonitorState, NetConStatus } from '../shared/types';
import { byId } from './dom';
import { formatDuration } from './format';
import { ConfigForm } from './views/config-form';
import { ControlPanel } from './views/control-panel';
import { LogPanel } from './views/log-panel';
import { ResultPanel } from './views/result-panel';

/** Wires the views to the main-process API and translates `AppEvent`s into UI updates. */
export class App {
  private readonly configForm = new ConfigForm();
  private readonly control = new ControlPanel();
  private readonly result = new ResultPanel();
  private readonly log = new LogPanel();

  private monitorState: MonitorState = 'idle';
  private serverFound = false;
  private startedAt = 0;
  private netconStatus: NetConStatus | null = null;

  constructor(private readonly api: RendererApi) {}

  async init(): Promise<void> {
    this.bindControls();
    this.api.onEvent((event) => this.handleEvent(event));

    const [info, config, netcon] = await Promise.all([
      this.api.getAppInfo(),
      this.api.getConfig(),
      this.api.getNetConStatus(),
    ]);
    byId('version').textContent = `v${info.version} · MADE BY ACIDED1`;

    this.configForm.write(config);
    this.refreshCanStart();
    this.control.setMonitorStatus('idle', 'Ready');
    if (config.token && config.channelId) this.log.success('Configuration loaded');
    else this.log.info('No saved configuration — enter token and channel ID');

    this.handleNetConStatus(netcon);
  }

  private bindControls(): void {
    byId('btn-minimize').addEventListener('click', () => this.api.minimizeWindow());
    byId('btn-close').addEventListener('click', () => this.api.closeWindow());

    this.configForm.onChange(() => this.refreshCanStart());
    this.configForm.onSave(() => void this.saveConfig());
    this.configForm.onOpenFolder(() => void this.api.openConfigFolder());

    this.control.onMessageIdChange(() => this.refreshCanStart());
    this.control.onStart(() => void this.start());
    this.control.onStop(() => void this.api.stopMonitoring());

    this.result.onLaunch(() => void this.launchManually());
  }

  private refreshCanStart(): void {
    this.control.setCanStart(this.configForm.refreshValidity() && this.control.isMessageIdValid);
  }

  private async saveConfig(): Promise<boolean> {
    const result = await this.api.saveConfig(this.configForm.read());
    if (!result.ok) {
      this.log.error(result.error);
      return false;
    }
    this.configForm.write(result.value);
    this.log.success(`Configuration saved (NetCon port ${result.value.netconPort})`);
    return true;
  }

  private async start(): Promise<void> {
    // Start always runs with what is on screen, so unsaved edits are saved first.
    if (!(await this.saveConfig())) return;

    this.log.clear();
    this.result.hide();
    this.serverFound = false;
    this.monitorState = 'idle';
    this.startedAt = Date.now();
    this.setRunning(true);

    const result = await this.api.startMonitoring(this.control.messageIdValue);
    if (!result.ok) {
      // Failures after the request reached the monitor already arrive (and get logged) as an 'error' state.
      const alreadyReported: boolean = (this.monitorState as MonitorState) === 'error';
      if (!alreadyReported) this.log.error(result.error);
      this.setRunning(false);
    }
  }

  private async launchManually(): Promise<void> {
    const result = await this.api.launchLast();
    if (!result.ok) this.log.error(result.error);
  }

  private setRunning(running: boolean): void {
    this.control.setRunning(running);
    this.configForm.setDisabled(running);
  }

  private handleEvent(event: AppEvent): void {
    switch (event.type) {
      case 'monitor-state':
        this.handleMonitorState(event.state, event.detail);
        break;
      case 'connect-found':
        this.handleConnectFound(event.connect, event.source === 'gateway' ? 'message edited' : 'snapshot');
        break;
      case 'message-updated':
        this.log.info(event.result === 'no-connect'
          ? 'Message edited — no connect string'
          : 'Message edited — same server, skipping');
        break;
      case 'launch':
        this.handleLaunch(event.outcome, event.trigger, event.connect);
        break;
      case 'netcon-status':
        this.handleNetConStatus(event.status);
        break;
      case 'warning':
        this.log.warn(event.message);
        break;
    }
  }

  private handleMonitorState(state: MonitorState, detail?: string): void {
    const previous = this.monitorState;
    this.monitorState = state;
    const changed = state !== previous;

    switch (state) {
      case 'connecting':
        this.control.setMonitorStatus('pending', 'Connecting…');
        if (changed) this.log.info('Connecting to Discord…');
        break;
      case 'listening':
        this.control.setMonitorStatus(this.serverFound ? 'ok' : 'pending',
          this.serverFound ? 'Server found · listening for edits' : 'Listening for edits…');
        if (changed) this.log.success('Gateway connected, listening for edits');
        break;
      case 'reconnecting':
        this.control.setMonitorStatus('pending', 'Reconnecting…');
        if (changed) this.log.warn('Gateway connection lost, reconnecting…');
        break;
      case 'error':
        this.control.setMonitorStatus('error', detail ?? 'Error');
        this.log.error(detail ?? 'Monitoring failed');
        this.setRunning(false);
        break;
      case 'idle':
        this.control.setMonitorStatus('idle', 'Stopped');
        this.log.info('Monitoring stopped');
        this.setRunning(false);
        break;
    }
  }

  private handleConnectFound(connect: ConnectInfo, via: string): void {
    this.serverFound = true;
    this.log.success(`Server found (${via}): ${connect.host}:${connect.port}`);
    this.log.info(`Matched text: ${connect.raw}`);
    this.control.setMonitorStatus('ok', 'Server found · listening for edits');
    this.result.show(connect, formatDuration(Date.now() - this.startedAt));
  }

  private handleLaunch(outcome: LaunchOutcome, trigger: LaunchTrigger, connect: ConnectInfo): void {
    const prefix = trigger === 'auto' ? 'AUTO-LAUNCH' : 'MANUAL LAUNCH';
    if (outcome.method === 'netcon') {
      this.log.success(`${prefix}: sent "connect ${connect.host}:${connect.port}" to CS2 console`);
    } else {
      this.log.warn(`${prefix}: ${outcome.fallbackReason ?? 'NetCon unavailable'} — opened steam:// URL instead`);
    }
  }

  private handleNetConStatus(status: NetConStatus): void {
    const previous = this.netconStatus;
    this.netconStatus = status;
    this.control.setNetConStatus(status);

    const portChanged = previous !== null && previous.port !== status.port;
    if (status.state === 'connected' && previous?.state !== 'connected') {
      this.log.success(`CS2 NetCon connected on port ${status.port}`);
    } else if (previous?.state === 'connected' && status.state !== 'connected') {
      this.log.warn('CS2 NetCon disconnected — game closed?');
    } else if (status.state !== 'connected' && (previous === null || portChanged)) {
      this.log.info(`Waiting for CS2 NetCon on port ${status.port} (launch CS2 with -netconport ${status.port})`);
    }
  }
}

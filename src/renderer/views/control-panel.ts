import { isSnowflake } from '../../shared/config';
import type { NetConStatus } from '../../shared/types';
import { byId, setStatusDot, type StatusKind } from '../dom';

export class ControlPanel {
  private readonly messageId = byId<HTMLInputElement>('input-message');
  private readonly startButton = byId<HTMLButtonElement>('btn-start');
  private readonly stopButton = byId<HTMLButtonElement>('btn-stop');
  private readonly monitorDot = byId('monitor-dot');
  private readonly monitorText = byId('monitor-text');
  private readonly netconDot = byId('netcon-dot');
  private readonly netconText = byId('netcon-text');

  private running = false;
  private canStart = false;

  get messageIdValue(): string {
    return this.messageId.value.trim();
  }

  get isMessageIdValid(): boolean {
    return isSnowflake(this.messageIdValue);
  }

  setRunning(running: boolean): void {
    this.running = running;
    this.messageId.disabled = running;
    this.render();
  }

  /** Whether the rest of the UI (config) allows starting. */
  setCanStart(canStart: boolean): void {
    this.canStart = canStart;
    this.render();
  }

  setMonitorStatus(kind: StatusKind, text: string): void {
    setStatusDot(this.monitorDot, kind);
    this.monitorText.textContent = text;
  }

  setNetConStatus({ state, port, attempt }: NetConStatus): void {
    switch (state) {
      case 'connected':
        setStatusDot(this.netconDot, 'ok');
        this.netconText.textContent = `Connected · 127.0.0.1:${port}`;
        break;
      case 'connecting':
        setStatusDot(this.netconDot, 'pending');
        this.netconText.textContent = `Waiting for CS2 on :${port} (attempt #${attempt})`;
        break;
      case 'disconnected':
        setStatusDot(this.netconDot, 'error');
        this.netconText.textContent = `Disconnected · :${port}`;
        break;
    }
  }

  onStart(listener: () => void): void {
    this.startButton.addEventListener('click', listener);
    this.messageId.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !this.startButton.disabled) listener();
    });
  }

  onStop(listener: () => void): void {
    this.stopButton.addEventListener('click', listener);
  }

  onMessageIdChange(listener: () => void): void {
    this.messageId.addEventListener('input', listener);
  }

  private render(): void {
    this.startButton.disabled = this.running || !this.canStart;
    this.stopButton.disabled = !this.running;
  }
}

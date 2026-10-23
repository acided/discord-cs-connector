import type { ConnectInfo } from '../../shared/types';
import { byId } from '../dom';

export class ResultPanel {
  private readonly panel = byId('result-panel');
  private readonly host = byId('result-host');
  private readonly port = byId('result-port');
  private readonly password = byId('result-password');
  private readonly time = byId('result-time');
  private readonly url = byId('result-url');
  private readonly launchButton = byId<HTMLButtonElement>('btn-launch');

  show(connect: ConnectInfo, detectedAfter: string): void {
    this.host.textContent = connect.host;
    this.port.textContent = String(connect.port);
    this.password.textContent = connect.password ?? '—';
    this.time.textContent = detectedAfter;
    this.url.textContent = connect.steamUrl;
    this.panel.hidden = false;
  }

  hide(): void {
    this.panel.hidden = true;
  }

  onLaunch(listener: () => void): void {
    this.launchButton.addEventListener('click', listener);
  }
}

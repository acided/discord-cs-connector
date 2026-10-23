import { DEFAULT_NETCON_PORT, isSnowflake, isValidPort, type AppConfig } from '../../shared/config';
import { byId } from '../dom';

export class ConfigForm {
  private readonly token = byId<HTMLInputElement>('input-token');
  private readonly channel = byId<HTMLInputElement>('input-channel');
  private readonly port = byId<HTMLInputElement>('input-port');
  private readonly saveButton = byId<HTMLButtonElement>('btn-save');
  private readonly folderButton = byId<HTMLButtonElement>('btn-config-folder');

  read(): AppConfig {
    return {
      token: this.token.value.trim(),
      channelId: this.channel.value.trim(),
      netconPort: Number(this.port.value) || DEFAULT_NETCON_PORT,
    };
  }

  write(config: AppConfig): void {
    this.token.value = config.token;
    this.channel.value = config.channelId;
    this.port.value = String(config.netconPort);
    this.refreshValidity();
  }

  /** True when every field holds a plausible value; also highlights invalid fields. */
  refreshValidity(): boolean {
    const { token, channelId } = this.read();
    const portValid = isValidPort(Number(this.port.value));
    const channelValid = isSnowflake(channelId);

    this.channel.classList.toggle('invalid', channelId !== '' && !channelValid);
    this.port.classList.toggle('invalid', this.port.value !== '' && !portValid);
    return token !== '' && channelValid && portValid;
  }

  setDisabled(disabled: boolean): void {
    for (const control of [this.token, this.channel, this.port, this.saveButton]) control.disabled = disabled;
  }

  onChange(listener: () => void): void {
    for (const input of [this.token, this.channel, this.port]) input.addEventListener('input', listener);
  }

  onSave(listener: () => void): void {
    this.saveButton.addEventListener('click', listener);
  }

  onOpenFolder(listener: () => void): void {
    this.folderButton.addEventListener('click', listener);
  }
}

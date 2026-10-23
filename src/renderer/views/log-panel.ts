import { byId } from '../dom';
import { clockTime } from '../format';

type LogLevel = 'info' | 'success' | 'warn' | 'error';

const MAX_ENTRIES = 500;

export class LogPanel {
  private readonly container = byId('log');

  info(message: string): void { this.append('info', message); }
  success(message: string): void { this.append('success', message); }
  warn(message: string): void { this.append('warn', message); }
  error(message: string): void { this.append('error', message); }

  clear(): void {
    this.container.replaceChildren();
  }

  private append(level: LogLevel, message: string): void {
    const entry = document.createElement('div');
    entry.className = `log-entry ${level}`;

    const time = document.createElement('span');
    time.className = 'ts';
    time.textContent = `[${clockTime()}]`;

    const text = document.createElement('span');
    text.className = 'msg';
    text.textContent = message;

    entry.append(time, text);
    this.container.append(entry);
    while (this.container.childElementCount > MAX_ENTRIES) this.container.firstElementChild?.remove();
    this.container.scrollTop = this.container.scrollHeight;
  }
}

import type { AppConfig } from './config';
import type { AppEvent } from './events';
import type { Result } from './result';
import type { AppInfo, LaunchOutcome, NetConStatus } from './types';

/** The `window.api` surface the preload script exposes to the renderer. */
export interface RendererApi {
  getAppInfo(): Promise<AppInfo>;
  openConfigFolder(): Promise<void>;

  getConfig(): Promise<AppConfig>;
  saveConfig(config: AppConfig): Promise<Result<AppConfig>>;

  startMonitoring(messageId: string): Promise<Result>;
  stopMonitoring(): Promise<void>;

  /** Re-launches the most recently detected server. */
  launchLast(): Promise<Result<LaunchOutcome>>;
  getNetConStatus(): Promise<NetConStatus>;

  minimizeWindow(): void;
  closeWindow(): void;

  /** Subscribes to main-process events; returns an unsubscribe function. */
  onEvent(listener: (event: AppEvent) => void): () => void;
}

import type { AppConfig } from './config';
import type { Result } from './result';
import type { AppInfo, LaunchOutcome, NetConStatus } from './types';

/** Request/response channels (`ipcRenderer.invoke` ↔ `ipcMain.handle`). */
export interface InvokeContract {
  'app:info': { args: []; result: AppInfo };
  'app:open-config-folder': { args: []; result: void };
  'config:get': { args: []; result: AppConfig };
  'config:save': { args: [config: AppConfig]; result: Result<AppConfig> };
  'monitor:start': { args: [messageId: string]; result: Result };
  'monitor:stop': { args: []; result: void };
  'game:launch-last': { args: []; result: Result<LaunchOutcome> };
  'netcon:status': { args: []; result: NetConStatus };
}

export type InvokeChannel = keyof InvokeContract;
export type InvokeArgs<C extends InvokeChannel> = InvokeContract[C]['args'];
export type InvokeResult<C extends InvokeChannel> = InvokeContract[C]['result'];

/** Fire-and-forget channels (`ipcRenderer.send` → `ipcMain.on`). */
export type SendChannel = 'window:minimize' | 'window:close';

/** Single channel carrying every `AppEvent` from main to renderer. */
export const APP_EVENT_CHANNEL = 'app:event';

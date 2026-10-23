import { app, ipcMain, shell, type BrowserWindow } from 'electron';
import { isSnowflake, validateConfig } from '../shared/config';
import type { InvokeArgs, InvokeChannel, InvokeResult, SendChannel } from '../shared/ipc';
import { errorMessage, fail, ok } from '../shared/result';
import type { ConfigStore } from './config/config-store';
import type { NetConClient } from './game/netcon-client';
import type { MonitorService } from './monitor/monitor-service';

export interface IpcDeps {
  window: BrowserWindow;
  configStore: ConfigStore;
  netcon: NetConClient;
  monitor: MonitorService;
}

function handle<C extends InvokeChannel>(
  channel: C,
  handler: (...args: InvokeArgs<C>) => InvokeResult<C> | Promise<InvokeResult<C>>,
): void {
  ipcMain.handle(channel, (_event, ...args) => handler(...(args as InvokeArgs<C>)));
}

function on(channel: SendChannel, listener: () => void): void {
  ipcMain.on(channel, listener);
}

export function registerIpcHandlers({ window, configStore, netcon, monitor }: IpcDeps): void {
  handle('app:info', () => ({ version: app.getVersion() }));
  handle('app:open-config-folder', async () => {
    await shell.openPath(configStore.directory);
  });

  handle('config:get', () => configStore.current);
  handle('config:save', (config) => {
    const validated = validateConfig(config);
    if (!validated.ok) return validated;
    try {
      configStore.save(validated.value);
    } catch (err) {
      return fail(`Failed to save config: ${errorMessage(err)}`);
    }
    netcon.setPort(validated.value.netconPort);
    return ok(validated.value);
  });

  handle('monitor:start', (messageId) => {
    const id = messageId.trim();
    if (!isSnowflake(id)) return fail('Message ID must be a 17–20 digit number');
    const config = validateConfig(configStore.current);
    if (!config.ok) return config;
    return monitor.start({ token: config.value.token, channelId: config.value.channelId, messageId: id });
  });
  handle('monitor:stop', () => monitor.stop());

  handle('game:launch-last', () => monitor.launchLast());
  handle('netcon:status', () => netcon.status);

  on('window:minimize', () => window.minimize());
  on('window:close', () => window.close());
}

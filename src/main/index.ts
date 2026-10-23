import path from 'node:path';
import { app, shell, type BrowserWindow } from 'electron';
import type { AppEvent } from '../shared/events';
import { APP_EVENT_CHANNEL } from '../shared/ipc';
import { ConfigStore } from './config/config-store';
import { safeStorageCodec } from './config/secret-codec';
import { GatewayClient } from './discord/gateway-client';
import { fetchMessage } from './discord/rest-client';
import { GameLauncher } from './game/game-launcher';
import { NetConClient } from './game/netcon-client';
import { registerIpcHandlers } from './ipc-handlers';
import { MonitorService } from './monitor/monitor-service';
import { createMainWindow } from './window';

function bootstrap(): void {
  const configStore = new ConfigStore(path.join(app.getPath('userData'), 'config.json'), safeStorageCodec);
  const config = configStore.load();

  const window = createMainWindow();
  const emit = (event: AppEvent): void => {
    if (!window.isDestroyed()) window.webContents.send(APP_EVENT_CHANNEL, event);
  };

  const netcon = new NetConClient(config.netconPort, (status) => emit({ type: 'netcon-status', status }));
  const launcher = new GameLauncher(netcon, (url) => shell.openExternal(url));
  const monitor = new MonitorService({
    fetchMessage,
    createGateway: (token, listener) => new GatewayClient(token, listener),
    launcher,
    emit,
  });

  registerIpcHandlers({ window, configStore, netcon, monitor });
  netcon.start();

  app.on('before-quit', () => {
    monitor.stop({ silent: true });
    netcon.stop();
  });
  app.on('second-instance', () => focus(window));
}

function focus(window: BrowserWindow): void {
  if (window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.focus();
}

if (app.requestSingleInstanceLock()) {
  app.on('window-all-closed', () => app.quit());
  void app.whenReady().then(bootstrap);
} else {
  app.quit();
}

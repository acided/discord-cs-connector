import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { RendererApi } from '../shared/api';
import type { AppEvent } from '../shared/events';
import { APP_EVENT_CHANNEL, type InvokeArgs, type InvokeChannel, type InvokeResult } from '../shared/ipc';

function invoke<C extends InvokeChannel>(channel: C, ...args: InvokeArgs<C>): Promise<InvokeResult<C>> {
  return ipcRenderer.invoke(channel, ...args) as Promise<InvokeResult<C>>;
}

const api: RendererApi = {
  getAppInfo: () => invoke('app:info'),
  openConfigFolder: () => invoke('app:open-config-folder'),

  getConfig: () => invoke('config:get'),
  saveConfig: (config) => invoke('config:save', config),

  startMonitoring: (messageId) => invoke('monitor:start', messageId),
  stopMonitoring: () => invoke('monitor:stop'),

  launchLast: () => invoke('game:launch-last'),
  getNetConStatus: () => invoke('netcon:status'),

  minimizeWindow: () => ipcRenderer.send('window:minimize'),
  closeWindow: () => ipcRenderer.send('window:close'),

  onEvent(listener) {
    const wrapped = (_event: IpcRendererEvent, appEvent: AppEvent): void => listener(appEvent);
    ipcRenderer.on(APP_EVENT_CHANNEL, wrapped);
    return () => ipcRenderer.removeListener(APP_EVENT_CHANNEL, wrapped);
  },
};

contextBridge.exposeInMainWorld('api', api);

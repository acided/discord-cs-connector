import path from 'node:path';
import { BrowserWindow } from 'electron';

export function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 520,
    height: 900,
    resizable: false,
    frame: false,
    backgroundColor: '#0d0f14',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // The UI is a single local page: block navigation and pop-ups entirely.
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());

  window.once('ready-to-show', () => window.show());
  void window.loadFile(path.join(__dirname, '../renderer/index.html'));
  return window;
}

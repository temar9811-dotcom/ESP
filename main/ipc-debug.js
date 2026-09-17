// main/ipc-debug.js
// VERSION: 1.1
'use strict';
const { ipcMain } = require('electron');
const logger = require('./debug/logger');
const debugEngine = require('./debug/engine');
const windowTray = require('./window-tray');

function sendToRenderer(channel, payload) {
  const win = windowTray.getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function registerDebugIpc() {
  // Subscribe to logger and push to UI
  logger.subscribe((entry) => {
    sendToRenderer('debug:log', entry);
  });

  ipcMain.handle('debug:getLogs', () => logger.getLogs());
  ipcMain.handle('debug:clearLogs', () => { logger.clearLogs(); return true; });
  ipcMain.handle('debug:getActions', () => debugEngine.getActions());
  ipcMain.handle('debug:runAction', async (_e, name, payload) => debugEngine.runAction(name, payload));

  // Handle UI debug logs (filtered by logger V2)
  ipcMain.handle('debug:log', (_e, payload) => {
    logger.info(payload.source || 'UI', payload.message, payload.data);
  });
}

module.exports = { registerDebugIpc };
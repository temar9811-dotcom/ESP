// File: main/ipc-debug.js | Version: 1.1
'use strict';
const { ipcMain, BrowserWindow } = require('electron');
const debugLogger = require('./debug-logger');
const debugEngine = require('./debug-engine');

function broadcastLog(entry) {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send('debug:log', entry); } catch {}
  }
}

function registerDebugIpc() {
  debugLogger.init();
  debugLogger.enableIPCTracing();
  debugLogger.subscribe(broadcastLog);
  debugEngine.registerDefaultActions();

  ipcMain.handle('debug:getLogs', () => debugLogger.getLogs());
  ipcMain.handle('debug:getActions', () => debugEngine.getActions());
  ipcMain.handle('debug:runAction', async (_event, name, payload) => debugEngine.runAction(name, payload));
  ipcMain.handle('debug:clearLogs', () => {
    debugLogger.clearLogs();
    return { ok: true };
  });

  ipcMain.handle('debug:log', (_event, payload) => {
    const level = String(payload?.level || 'debug').toLowerCase();
    const safeLevel = ['debug', 'info', 'warn', 'error'].includes(level) ? level : 'debug';
    const source = payload?.source || 'UI';
    const message = payload?.message || '';
    debugLogger[safeLevel](source, message, payload?.data);
    return { ok: true };
  });
}

module.exports = { registerDebugIpc };
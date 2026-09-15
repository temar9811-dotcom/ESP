// File: main/debug-logger.js | Version: 1.1
'use strict';
const { app, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_LOGS = 500;
let logs = [];
let subscribers = [];
let ipcTracingEnabled = false;

function logDir() {
  return path.join(app.getPath('userData'), 'debug-logs');
}

function rotateFiles() {
  const dir = logDir();
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  const f3 = path.join(dir, 'debug-3.log');
  const f2 = path.join(dir, 'debug-2.log');
  const f1 = path.join(dir, 'debug-1.log');
  if (fs.existsSync(f3)) fs.unlinkSync(f3);
  if (fs.existsSync(f2)) fs.renameSync(f2, f3);
  if (fs.existsSync(f1)) fs.renameSync(f1, f2);
}

function formatLog(entry) {
  const ts = new Date(entry.timestamp).toISOString();
  const data = entry.data ? `${JSON.stringify(entry.data)}` : '';
  return `[${ts}] [${entry.level}] [${entry.source}] ${entry.message}${data}`;
}

function saveToFile() {
  const file = path.join(logDir(), 'debug-1.log');
  try { fs.writeFileSync(file, logs.map((l) => formatLog(l)).join('\n'), 'utf8'); } catch {}
}

function addLog(level, source, message, data) {
  const entry = { timestamp: Date.now(), level, source, message, data };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  subscribers.forEach((cb) => { try { cb(entry); } catch {} });
  saveToFile();
}

const logger = {
  init() {
    rotateFiles();
    logs = [];
    addLog('INFO', 'MAIN', 'Debug logger initialized');
  },
  clearLogs() {
    logs = [];
    saveToFile();
  },
  debug: (source, message, data) => addLog('DEBUG', source, message, data),
  info: (source, message, data) => addLog('INFO', source, message, data),
  warn: (source, message, data) => addLog('WARN', source, message, data),
  error: (source, message, data) => addLog('ERROR', source, message, data),
  getLogs: () => [...logs],
  subscribe: (cb) => {
    subscribers.push(cb);
    return () => { subscribers = subscribers.filter((s) => s !== cb); };
  },
  enableIPCTracing: () => {
    if (ipcTracingEnabled) return;
    ipcTracingEnabled = true;
    const originalHandle = ipcMain.handle;
    ipcMain.handle = function (channel, handler) {
      return originalHandle.call(ipcMain, channel, async (event, ...args) => {
        logger.debug('IPC', `→ ${channel}`, { args: args.length });
        try {
          const result = await handler(event, ...args);
          const size = typeof result === 'object' ? JSON.stringify(result).length : 0;
          logger.debug('IPC', `← ${channel}`, { success: true, size });
          return result;
        } catch (err) {
          logger.error('IPC', `← ${channel}`, { success: false, error: err.message });
          throw err;
        }
      });
    };
    addLog('INFO', 'MAIN', 'IPC tracing enabled');
  }
};

module.exports = logger;
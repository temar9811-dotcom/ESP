// main/debug/logger.js
// VERSION: 1.0

'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const MAX_LOGS = 500;
const DEBUG_CHANNEL = 'ESP_DEBUG_V2'; // Hidden channel for filtering

let logs = [];
let subscribers = [];

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
  const data = entry.data ? ` ${JSON.stringify(entry.data)}` : '';
  return `[${ts}] [${entry.level}] [${entry.source}] ${entry.message}${data}`;
}

function saveToFile() {
  const file = path.join(logDir(), 'debug-1.log');
  try { fs.writeFileSync(file, logs.map(formatLog).join('\n'), 'utf8'); } catch {}
}

function addLog(level, source, message, data) {
  const entry = { 
    timestamp: Date.now(), 
    level, 
    source, 
    message, 
    data,
    channel: DEBUG_CHANNEL 
  };
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
  subscribers.forEach((cb) => { try { cb(entry); } catch {} });
  saveToFile();
}

const logger = {
  init() {
    rotateFiles();
    logs = [];
    addLog('INFO', 'SYSTEM', 'Debug logger initialized');
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
  }
};

module.exports = logger;
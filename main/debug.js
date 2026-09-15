// File: main/debug.js | Version: 1.1
'use strict';
const logger = require('./debug-logger');

function fmt(value) {
  if (value instanceof Error) return value.message;
  if (typeof value === 'object' && value !== null) {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function log(section, ...args) {
  const messageParts = [];
  let data;

  for (const arg of args) {
    if (arg && typeof arg === 'object' && !(arg instanceof Error)) {
      if (data === undefined) data = arg;
      else messageParts.push(fmt(arg));
    } else {
      messageParts.push(fmt(arg));
    }
  }

  const message = messageParts.join(' ') || 'log';
  logger.debug(String(section || 'MAIN'), message, data);
}

function isEnabled() {
  return true;
}

module.exports = { log, isEnabled };
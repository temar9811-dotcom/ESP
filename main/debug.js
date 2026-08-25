'use strict';

// Debug logging for the main process. Output goes to stdout (the command
// prompt the app was launched from) and is only emitted while the test
// module is active (test/test-mode.json -> { "enabled": true }). The flag
// file is read on every log call, so toggling it needs no app restart.

const fs = require('fs');
const path = require('path');

function modeFile() {
  return path.join(__dirname, '..', 'test', 'test-mode.json');
}

function isEnabled() {
  try {
    const data = JSON.parse(fs.readFileSync(modeFile(), 'utf8'));
    return data.enabled === true;
  } catch {
    return false;
  }
}

function fmt(value) {
  if (value instanceof Error) return `${value.message}`;
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function log(section, ...args) {
  if (!isEnabled()) return;

  const stamp = new Date().toISOString();
  console.log(`[ESP ${stamp}] [${section}]`, ...args.map(fmt));
}

module.exports = { log, isEnabled };

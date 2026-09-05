// FILE: main/settings.js
// VERSION: 1.1.17-beta
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const DEFAULT_SETTINGS = {
  importEnabled: true,
  hidePrimaryWhenCollapsed: false,
  openAtLogin: false,
  startMinimized: false,
  muteSounds: false,
  notifySkill: true,
  notifyWallet: true,
  notifyQueueEmpty: true,
  queueWarnHours: 24,
  failTTL: 300,
  walletNotifyThreshold: 0,
  clockLarge: false
};
function getSettingsFile() {
  return path.join(app.getPath('userData'), 'config.json');
}
function getSettings() {
  try {
    const raw = fs.readFileSync(getSettingsFile(), 'utf8');
    const data = JSON.parse(raw);
    return { ...DEFAULT_SETTINGS, ...(data || {}) };
  } catch {
    const defaults = { ...DEFAULT_SETTINGS };
    try {
      fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
      fs.writeFileSync(
        getSettingsFile(),
        JSON.stringify(defaults, null, 2),
        'utf8'
      );
    } catch {
      // Ignore write errors.
    }
    return defaults;
  }
}
function setSettings(patch) {
  const current = getSettings();
  const next = { ...current, ...(patch || {}) };
  const safe = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    safe[key] = next[key];
  }
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(
    getSettingsFile(),
    JSON.stringify(safe, null, 2),
    'utf8'
  );
  return safe;
}
module.exports = {
  getSettings,
  setSettings
};
// FILE: main/settings.js
// VERSION: 1.1.19-beta
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./debug/logger');
const DEFAULT_SETTINGS = {
  importEnabled: true,
  hidePrimaryWhenCollapsed: false,
  openAtLogin: false,
  startMinimized: false,
  autoInstallUpdates: true,
  muteSounds: false,
  notifySkill: true,
  notifyWallet: true,
  notifyQueueEmpty: true,
  customSoundSkill: null,
  customSoundWallet: null,
  customSoundQueue: null,
  queueWarnHours: 24,
  failTTL: 300,
  walletNotifyThreshold: 0,
  clockLarge: false,
  theme: 'kick-mrchi',
  biggerText: false,
  tabsVerticalLock: false,
  tabsHorizontalLock: false,
  enabledTabs: ['overview', 'skills', 'wallet', 'assets', 'clones', 'notifications', 'notes', 'plans'],
  toastX: null,
  toastY: null,
  toastMaxVisible: 5,
  toastDurationMs: 8000,
  toastStackTop: true,
  lastSeenVersion: ''
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
  const changed = {};
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    safe[key] = next[key];
    if (safe[key] !== current[key]) changed[key] = safe[key];
  }
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(
    getSettingsFile(),
    JSON.stringify(safe, null, 2),
    'utf8'
  );
  const changedKeys = Object.keys(changed);
  if (changedKeys.length) {
    logger.info('SETTINGS', 'Settings updated', { changed });
  }
  return safe;
}

function resetSettings() {
  const defaults = { ...DEFAULT_SETTINGS };
  fs.mkdirSync(path.dirname(getSettingsFile()), { recursive: true });
  fs.writeFileSync(
    getSettingsFile(),
    JSON.stringify(defaults, null, 2),
    'utf8'
  );
  logger.info('SETTINGS', 'Settings reset to defaults');
  return defaults;
}
module.exports = {
  getSettings,
  setSettings,
  resetSettings
};
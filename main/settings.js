'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DEFAULT_SETTINGS = {
  importEnabled: true
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
    return { ...DEFAULT_SETTINGS };
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
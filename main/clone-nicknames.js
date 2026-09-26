// main/clone-nicknames.js
// VERSION: 1.0
// Per-character nicknames for jump clones and the home station, keyed by
// location_id (the only stable identifier ESI returns for a clone).
'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./debug/logger');

let store = null;

function nicknamesFile() {
  return path.join(app.getPath('userData'), 'clone-nicknames.json');
}

function load() {
  if (store) return store;
  try {
    store = JSON.parse(fs.readFileSync(nicknamesFile(), 'utf8')) || {};
  } catch {
    store = {};
  }
  return store;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(nicknamesFile()), { recursive: true });
    fs.writeFileSync(nicknamesFile(), JSON.stringify(store || {}, null, 2), 'utf8');
  } catch {
    // Ignore write errors.
  }
}

function getNicknames(characterId) {
  const data = load();
  const entry = data[String(characterId)];
  return entry && typeof entry === 'object' ? { ...entry } : {};
}

function setNickname(characterId, locationId, name) {
  const data = load();
  const charKey = String(characterId);
  const locKey = String(locationId);
  const clean = String(name || '').trim().slice(0, 64);

  if (!data[charKey] || typeof data[charKey] !== 'object') data[charKey] = {};

  if (clean === '') {
    delete data[charKey][locKey];
    if (Object.keys(data[charKey]).length === 0) delete data[charKey];
    logger.info('CLONE-NICKNAMES', `Cleared nickname for ${charKey} @ ${locKey}`);
  } else {
    data[charKey][locKey] = clean;
    logger.info('CLONE-NICKNAMES', `Saved nickname for ${charKey} @ ${locKey}`, { length: clean.length });
  }

  save();
  return getNicknames(characterId);
}

module.exports = { getNicknames, setNickname };

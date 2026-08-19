'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let history = null;

function historyFile() {
  return path.join(app.getPath('userData'), 'clones-history.json');
}

function load() {
  if (history) return history;

  try {
    history = JSON.parse(fs.readFileSync(historyFile(), 'utf8')) || {};
  } catch {
    history = {};
  }

  return history;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(historyFile()), { recursive: true });
    fs.writeFileSync(historyFile(), JSON.stringify(history || {}, null, 2), 'utf8');
  } catch { /* ignore */ }
}

function getSnapshot(characterId) {
  return load()[String(characterId)] || null;
}

function setSnapshot(characterId, data) {
  const all = load();
  all[String(characterId)] = {
    jumpClones: data.jump_clones || [],
    lastCloneJumpDate: data.last_clone_jump_date || null,
    fetchedAt: new Date().toISOString()
  };
  save();
}

module.exports = { getSnapshot, setSnapshot };

'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let nicknames = null;

function nicknamesFile() {
  return path.join(app.getPath('userData'), 'clones-nicknames.json');
}

function load() {
  if (nicknames) return nicknames;

  try {
    nicknames = JSON.parse(fs.readFileSync(nicknamesFile(), 'utf8')) || {};
  } catch {
    nicknames = {};
  }

  return nicknames;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(nicknamesFile()), { recursive: true });
    fs.writeFileSync(nicknamesFile(), JSON.stringify(nicknames || {}, null, 2), 'utf8');
  } catch { /* ignore */ }
}

function getAllNicknames() {
  return load();
}

function getNickname(cloneId) {
  const data = load();
  const entry = data[String(cloneId)];
  return entry && typeof entry.name === 'string' ? entry.name : '';
}

function setNickname(cloneId, name) {
  const data = load();
  const key = String(cloneId);
  const clean = String(name || '').trim();

  if (clean === '') {
    delete data[key];
  } else {
    data[key] = { name: clean, updatedAt: new Date().toISOString() };
  }

  save();
  return getNickname(cloneId);
}

module.exports = { getAllNicknames, getNickname, setNickname };

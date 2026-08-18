'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

let notes = null;

function notesFile() {
  return path.join(app.getPath('userData'), 'notes.json');
}

function load() {
  if (notes) return notes;

  try {
    notes = JSON.parse(fs.readFileSync(notesFile(), 'utf8')) || {};
  } catch {
    notes = {};
  }

  return notes;
}

function save() {
  try {
    fs.mkdirSync(path.dirname(notesFile()), { recursive: true });
    fs.writeFileSync(
      notesFile(),
      JSON.stringify(notes || {}, null, 2),
      'utf8'
    );
  } catch {
    // Ignore write errors.
  }
}

function getNote(characterId) {
  const data = load();
  const entry = data[String(characterId)];

  return entry && typeof entry.text === 'string' ? entry.text : '';
}

function setNote(characterId, text) {
  const data = load();
  const key = String(characterId);
  const clean = String(text || '');

  if (clean === '') {
    delete data[key];
  } else {
    data[key] = { text: clean, updatedAt: new Date().toISOString() };
  }

  save();
  return getNote(characterId);
}

module.exports = {
  getNote,
  setNote
};
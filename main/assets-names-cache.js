// File: main/assets-names-cache.js | Version: 1.1
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const logger = require('./debug-logger');

let cache = null;
let pulling = false;

function cacheFile() { return path.join(app.getPath('userData'), 'assets-names-cache.json'); }

function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {}; } catch { cache = {}; }
  if (!cache || typeof cache !== 'object') cache = {};
  if (!cache.characters || typeof cache.characters !== 'object') cache.characters = {};
  return cache;
}

function saveCache() {
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(loadCache()), 'utf8');
  } catch {}
}

function isPulling() { return pulling; }
function setPulling(val) { pulling = val; }
function resetCache() { cache = null; }

function getNames(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !entry.locations) return null;
  return {
    locations: entry.locations,
    items: entry.items || {},
    types: entry.types || {},
    fetchedAt: entry.fetchedAt || null,
    pulling: isPulling()
  };
}

function removeCharacter(characterId) {
  if (cache && cache.characters) { delete cache.characters[String(characterId)]; saveCache(); }
}

function store(characterId, result) { loadCache().characters[String(characterId)] = result; }

module.exports = { loadCache, saveCache, isPulling, setPulling, resetCache, getNames, removeCharacter, store };
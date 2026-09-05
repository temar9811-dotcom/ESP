// FILE: main/assets-cache.js
// VERSION: 1.1.16-beta
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');

function assetCacheFile(characterId) {
  return path.join(app.getPath('userData'), `assets-${characterId}.json`);
}

function corpAssetCacheFile(corpId) {
  return path.join(app.getPath('userData'), `corp-assets-${corpId}.json`);
}

function loadCache(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function saveCache(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
  } catch {
    // Ignore write errors.
  }
}

function getPersonalCache(characterId) {
  return loadCache(assetCacheFile(characterId));
}

function getCorpCache(corpId) {
  return loadCache(corpAssetCacheFile(corpId));
}

function savePersonalCache(characterId, tree) {
  saveCache(assetCacheFile(characterId), tree);
}

function saveCorpCache(corpId, tree) {
  saveCache(corpAssetCacheFile(corpId), tree);
}

module.exports = {
  getPersonalCache,
  getCorpCache,
  savePersonalCache,
  saveCorpCache
};
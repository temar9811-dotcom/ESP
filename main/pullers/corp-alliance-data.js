// main/pullers/corp-alliance-data.js
// VERSION: 1.0
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');

const CACHE_FILE = 'corp-alliance-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('CORP-ALLIANCE', 'Save failed', { error: e.message }); }
}

async function resolveBatch(ids) {
  loadCache();
  const unknownIds = ids.filter(id => !cache[id]);
  if (unknownIds.length === 0) return;

  const url = 'https://esi.evetech.net/latest/universe/names/?datasource=tranquility';
  const res = await fetcher.postRequest(url, unknownIds);
  
  for (const item of res.data) {
    if (item.category === 'corporation' || item.category === 'alliance') {
      cache[item.id] = item.name;
    }
  }
  saveCache();
  logger.info('CORP-ALLIANCE', `Resolved ${res.data.length} names`);
}

function queueResolution(ids, priority = 0) {
  if (!ids || ids.length === 0) return;
  loadCache();
  const uniqueIds = [...new Set(ids)].filter(id => !cache[id]);
  if (uniqueIds.length === 0) return;

  for (let i = 0; i < uniqueIds.length; i += 1000) {
    const batch = uniqueIds.slice(i, i + 1000);
    syncer.enqueue(priority, () => resolveBatch(batch));
  }
}

module.exports = { queueResolution, getCache: () => { loadCache(); return cache; } };
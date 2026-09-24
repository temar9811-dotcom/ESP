// main/pullers/universe-names.js
// VERSION: 1.4
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const staticDb = require('../esi/static-db');
const CACHE_FILE = 'universe-names-cache.json';
let cache = {};
let cacheLoaded = false;
function loadCache() {
if (cacheLoaded) return;
cacheLoaded = true;
try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}
function saveCache() {
try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('UNIVERSE-NAMES', 'Save failed', { error: e.message }); }
require('../snapshots').broadcastAll();
}
async function resolveBatch(ids) {
loadCache();
const unknownIds = ids.filter(id => typeof id === 'number' && id > 0 && !cache[id]);
if (unknownIds.length === 0) return;
const url = 'https://esi.evetech.net/latest/universe/names/?datasource=tranquility';
const res = await fetcher.postRequest(url, unknownIds);
for (const item of res.data) {
if (item.id && item.name) cache[item.id] = item.name;
}
saveCache();
logger.info('UNIVERSE-NAMES', `Resolved ${res.data.length} names via ESI`);
}
function queueResolution(ids, priority = 0) {
if (!ids || ids.length === 0) return;
loadCache();
const toResolve = [];
let cachedFromStatic = 0;
for (const id of ids) {
if (typeof id !== 'number' || id <= 0) continue;
if (cache[id]) continue;
// Check static DB: Types, Systems, Stations, Planets
const staticName = staticDb.getTypeName(id) || staticDb.getSystemName(id) || staticDb.getStationName(id) || staticDb.getPlanetName(id);
if (staticName) {
cache[id] = staticName;
cachedFromStatic++;
} else {
toResolve.push(id);
}
}
if (cachedFromStatic > 0) {
saveCache();
logger.debug('UNIVERSE-NAMES', `Cached ${cachedFromStatic} names from static DB`);
}
if (toResolve.length === 0) return;
for (let i = 0; i < toResolve.length; i += 1000) {
const batch = toResolve.slice(i, i + 1000);
syncer.enqueue(priority, () => resolveBatch(batch));
}
}
module.exports = { queueResolution, getCache: () => { loadCache(); return cache; } };
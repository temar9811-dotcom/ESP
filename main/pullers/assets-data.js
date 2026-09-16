// main/pullers/assets-data.js
// VERSION: 1.9
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const universeNames = require('./universe-names');
const structureNames = require('./structure-names');
const CACHE_FILE = 'assets-data-cache.json';
let cache = {}, cacheLoaded = false;
function loadCache() {
  if (cacheLoaded) return; cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}
function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('ASSETS-DATA', 'Save failed', { error: e.message }); }
}
async function pullCharacter(account, priority) {
  loadCache();
  const baseUrl = 'https://esi.evetech.net/latest';
  let token = await accounts.getValidAccessToken(account, false);
  async function makeRequest(url) {
    try { return await fetcher.request(url, token); }
    catch (err) {
      if (err.status === 401) {
        logger.warn('ASSETS-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }
  let page = 1, allAssets = [];
  const typeIds = new Set(), universeIds = new Set(), structureIds = new Set();
  const locationTypeCounts = {}, skippedItemIds = new Set();
  while (true) {
    const res = await makeRequest(`${baseUrl}/characters/${account.characterId}/assets/?datasource=tranquility&page=${page}`);
    const data = res.data;
    if (!data || data.length === 0) break;
    allAssets = allAssets.concat(data);
    for (const a of data) {
      locationTypeCounts[a.location_type] = (locationTypeCounts[a.location_type] || 0) + 1;
      typeIds.add(a.type_id);
      const locId = a.location_id, locType = a.location_type;
      if (locType === 'item') {
        skippedItemIds.add(locId); // Dynamic containers/ships
      } else if (locId >= 60000000 && locId < 70000000) {
        universeIds.add(locId); // NPC Stations
      } else if (locId >= 30000000 && locId < 40000000) {
        universeIds.add(locId); // Solar Systems (Planetary Infrastructure)
      } else if (locType === 'other') {
        universeIds.add(locId); // POCOs / Asset Safety (Let universe resolver handle or fail gracefully)
      } else {
        structureIds.add(locId); // Player Structures (Citadels, etc.)
        universeIds.add(locId);  // Fallback
      }
    }
    if (data.length < 1000) break;
    page++;
  }
  if (typeIds.size > 0) universeNames.queueResolution(Array.from(typeIds), priority);
  if (universeIds.size > 0) universeNames.queueResolution(Array.from(universeIds), priority);
  if (structureIds.size > 0) structureNames.resolve(Array.from(structureIds));
  cache[account.characterId] = {
    lastUpdated: Date.now(),
    assets: allAssets.map(a => ({ item_id: a.item_id, type_id: a.type_id, location_id: a.location_id, location_type: a.location_type, quantity: a.quantity, is_singleton: a.is_singleton }))
  };
  saveCache();
  logger.info('ASSETS-DATA', `Updated assets for ${account.characterName}`, { id: account.characterId, count: allAssets.length, types: locationTypeCounts });
}
function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('ASSETS-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc, priority));
  }
}
module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
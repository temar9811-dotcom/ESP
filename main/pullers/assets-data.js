// File: main/pullers/assets-data.js | Version: 2.0
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
const staticDb = require('../esi/static-db');
const CACHE_FILE = 'assets-data-cache.json';

let cache = {}, cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); }
  catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); }
  catch (e) { logger.error('ASSETS-DATA', 'Save failed', { error: e.message }); }
}

function buildTree(assets) {
  const tree = { regions: {} };
  const unresolved = [];
  const unresolvedMap = new Map();
  const structureCache = structureNames.getCache();
  const universeCache = universeNames.getCache();
  const itemIdSet = new Set(assets.map(a => a.item_id));

  for (const asset of assets) {
    const locId = asset.location_id;
    let regionName = null, systemName = null, locationName = null;

    // Skip if location_id is another asset's item_id (dynamic container/ship)
    if (itemIdSet.has(locId)) continue;

    // Try static DB first (stations, systems, planets)
    try {
      const hierarchy = staticDb.getLocationHierarchy(locId);
      if (hierarchy) {
        regionName = hierarchy.regionName;
        systemName = hierarchy.systemName;
        locationName = hierarchy.locationName;
      }
    } catch (err) {
      logger.debug('ASSETS-DATA', `getLocationHierarchy failed for ${locId}`, { error: err.message });
    }

    // Try structure cache (player structures)
    if (!regionName && structureCache[locId] && structureCache[locId].name) {
      const struct = structureCache[locId];
      try {
        const systemNameFromDb = staticDb.getSystemName(struct.system_id);
        const hierarchyFromSystem = systemNameFromDb ? staticDb.getLocationHierarchy(struct.system_id) : null;
        regionName = hierarchyFromSystem?.regionName || 'Unknown Region';
        systemName = systemNameFromDb || `System ${struct.system_id}`;
        locationName = struct.name;
      } catch (err) {
        logger.debug('ASSETS-DATA', `Structure hierarchy failed for ${locId}`, { error: err.message });
      }
    }

    // Try universe cache (fallback)
    if (!regionName && universeCache[locId]) {
      locationName = universeCache[locId];
      regionName = 'Unresolved';
      systemName = 'Unresolved';
    }

    // Mark as unresolved
    if (!regionName) {
      const key = `${locId}:${asset.location_type}`;
      if (!unresolvedMap.has(key)) {
        unresolvedMap.set(key, { id: locId, type: asset.location_type, assetCount: 0 });
      }
      unresolvedMap.get(key).assetCount++;
      continue;
    }

    // Build tree structure
    if (!tree.regions[regionName]) tree.regions[regionName] = { systems: {} };
    if (!tree.regions[regionName].systems[systemName]) tree.regions[regionName].systems[systemName] = { stations: {} };
    if (!tree.regions[regionName].systems[systemName].stations[locationName]) {
      tree.regions[regionName].systems[systemName].stations[locationName] = [];
    }
    tree.regions[regionName].systems[systemName].stations[locationName].push({
      item_id: asset.item_id,
      type_id: asset.type_id,
      type_name: universeCache[asset.type_id] || `Type ${asset.type_id}`,
      quantity: asset.quantity,
      location_type: asset.location_type
    });
  }

  unresolved.push(...unresolvedMap.values());
  return { tree, unresolved };
}

async function pullCharacter(account, priority) {
  loadCache();
  await staticDb.initDb(); // FIX: Initialize static DB before tree building
  
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
  const locationTypeCounts = {};

  while (true) {
    const res = await makeRequest(`${baseUrl}/characters/${account.characterId}/assets/?datasource=tranquility&page=${page}`);
    const data = res.data;
    if (!data || data.length === 0) break;
    allAssets = allAssets.concat(data);

    for (const a of data) {
      locationTypeCounts[a.location_type] = (locationTypeCounts[a.location_type] || 0) + 1;
      typeIds.add(a.type_id);
      const locId = a.location_id, locType = a.location_type;

      // Collect ALL location_ids for resolution
      if (locId >= 60000000 && locId < 70000000) {
        universeIds.add(locId); // NPC Stations
      } else if (locId >= 30000000 && locId < 40000000) {
        universeIds.add(locId); // Solar Systems
      } else if (locType === 'other') {
        universeIds.add(locId); // POCOs / Asset Safety
      } else if (locType === 'item') {
        // Could be structure, station, or container - let tree builder figure it out
        structureIds.add(locId);
        universeIds.add(locId);
      } else {
        structureIds.add(locId);
        universeIds.add(locId);
      }
    }

    if (data.length < 1000) break;
    page++;
  }

  if (typeIds.size > 0) universeNames.queueResolution(Array.from(typeIds), priority);
  if (universeIds.size > 0) universeNames.queueResolution(Array.from(universeIds), priority);
  if (structureIds.size > 0) {
    try { await structureNames.resolve(Array.from(structureIds)); }
    catch (err) { logger.warn('ASSETS-DATA', 'structureNames.resolve failed', { error: err.message }); }
  }

  const { tree, unresolved } = buildTree(allAssets);

  cache[account.characterId] = {
    lastUpdated: Date.now(),
    assets: allAssets.map(a => ({
      item_id: a.item_id,
      type_id: a.type_id,
      location_id: a.location_id,
      location_type: a.location_type,
      quantity: a.quantity,
      is_singleton: a.is_singleton
    })),
    tree,
    unresolved
  };

  saveCache();
  logger.info('ASSETS-DATA', `Updated assets for ${account.characterName}`, {
    id: account.characterId,
    count: allAssets.length,
    types: locationTypeCounts,
    hasTree: Boolean(tree),
    unresolvedCount: unresolved.length
  });
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
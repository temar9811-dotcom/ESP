// main/pullers/assets-data.js
// VERSION: 2.0
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
  try {
    fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2));
  } catch (e) {
    logger.error('ASSETS-DATA', 'Save failed', { error: e.message });
  }
}

function buildTree(assets) {
  const tree = { regions: {} };
  const unresolved = [];
  const unresolvedMap = new Map();
  const structureCache = structureNames.getCache();
  const universeCache = universeNames.getCache();

  for (const asset of assets) {
    const locId = asset.location_id;
    let regionName = null, systemName = null, locationName = null;

    // Try static DB first (stations, systems, planets)
    const hierarchy = staticDb.getLocationHierarchy(locId);
    if (hierarchy) {
      regionName = hierarchy.regionName;
      systemName = hierarchy.systemName;
      locationName = hierarchy.locationName;
    }
    // Try structure cache (player structures)
    else if (structureCache[locId] && structureCache[locId].name) {
      const struct = structureCache[locId];
      const systemNameFromDb = staticDb.getSystemName(struct.system_id);
      const hierarchyFromSystem = systemNameFromDb ? staticDb.getLocationHierarchy(struct.system_id) : null;
      regionName = hierarchyFromSystem?.regionName || 'Unknown Region';
      systemName = systemNameFromDb || `System ${struct.system_id}`;
      locationName = struct.name;
    }
    // Try universe cache (fallback for types/other IDs)
    else if (universeCache[locId]) {
      locationName = universeCache[locId];
      regionName = 'Unresolved';
      systemName = 'Unresolved';
    }
    // Mark as unresolved
    else {
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
  await staticDb.initDb();
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

      if (locType === 'item') {
        // Dynamic containers/ships - skip for now
      } else if (locId >= 60000000 && locId < 70000000) {
        universeIds.add(locId); // NPC Stations
      } else if (locId >= 30000000 && locId < 40000000) {
        universeIds.add(locId); // Solar Systems (PI)
      } else if (locType === 'other') {
        universeIds.add(locId); // POCOs / Asset Safety
      } else {
        structureIds.add(locId); // Player Structures
        universeIds.add(locId);
      }
    }

    if (data.length < 1000) break;
    page++;
  }

  // Queue name resolution
  if (typeIds.size > 0) universeNames.queueResolution(Array.from(typeIds), priority);
  if (universeIds.size > 0) universeNames.queueResolution(Array.from(universeIds), priority);
  if (structureIds.size > 0) await structureNames.resolve(Array.from(structureIds));

  // Build tree and track unresolved
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
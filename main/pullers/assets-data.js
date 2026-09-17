// main/pullers/assets-data.js
// VERSION: 2.1
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
  const itemIndex = new Map();
  for (const a of assets) itemIndex.set(a.item_id, a);

  // Children lookup: which assets sit inside a given container (location_type 'item')
  const childrenIndex = new Map();
  for (const a of assets) {
    if (a.location_type === 'item') {
      if (!childrenIndex.has(a.location_id)) childrenIndex.set(a.location_id, []);
      childrenIndex.get(a.location_id).push(a);
    }
  }
  // item_ids that were turned into a nested group (a container branch)
  const groupedIds = new Set();

  const typeName = (typeId) => universeCache[typeId] || staticDb.getTypeName(typeId) || `Type ${typeId}`;

  function resolveLocation(locId, locationType) {
    // Try static DB first (stations, systems)
    const hierarchy = staticDb.getLocationHierarchy(locId);
    if (hierarchy) {
      return { regionName: hierarchy.regionName, systemName: hierarchy.systemName, locationName: hierarchy.locationName };
    }
    // Try structure cache (player structures)
    const struct = structureCache[locId];
    if (struct && struct.name) {
      if (struct.region_name && struct.system_name) {
        return { regionName: struct.region_name, systemName: struct.system_name, locationName: struct.name };
      }
      const systemNameFromDb = staticDb.getSystemName(struct.system_id);
      const hierarchyFromSystem = systemNameFromDb ? staticDb.getLocationHierarchy(struct.system_id) : null;
      return {
        regionName: hierarchyFromSystem?.regionName || 'Unknown Region',
        systemName: systemNameFromDb || (struct.system_id ? `System ${struct.system_id}` : 'Unknown System'),
        locationName: struct.name
      };
    }
    // Try universe cache (fallback for types/other IDs)
    if (universeCache[locId]) {
      return { regionName: 'Unresolved', systemName: 'Unresolved', locationName: universeCache[locId] };
    }
    return null;
  }

  function markUnresolved(asset) {
    const key = `${asset.location_id}:${asset.location_type}`;
    let entry = unresolvedMap.get(key);
    if (!entry) {
      entry = { id: asset.location_id, type: asset.location_type, assetCount: 0, typeIds: [] };
      unresolvedMap.set(key, entry);
    }
    entry.assetCount++;
    if (!entry.typeIds.includes(asset.type_id)) entry.typeIds.push(asset.type_id);
  }

  function stationNodeFor(locId, locType) {
    const branch = resolveLocation(locId, locType);
    if (!branch) return null;
    if (!tree.regions[branch.regionName]) tree.regions[branch.regionName] = { systems: {} };
    if (!tree.regions[branch.regionName].systems[branch.systemName]) {
      tree.regions[branch.regionName].systems[branch.systemName] = { stations: {} };
    }
    const stations = tree.regions[branch.regionName].systems[branch.systemName].stations;
    if (!stations[branch.locationName]) stations[branch.locationName] = { items: [], groups: [] };
    return stations[branch.locationName];
  }

  function ensureGroup(node, containerAsset) {
    let group = (node.groups || []).find((g) => g.item_id === containerAsset.item_id);
    if (!group) {
      group = {
        item_id: containerAsset.item_id,
        type_id: containerAsset.type_id,
        name: typeName(containerAsset.type_id),
        items: [],
        groups: []
      };
      node.groups.push(group);
      groupedIds.add(containerAsset.item_id);
    }
    return group;
  }

  // Walk the holding chain: item's location_id points at the ship/container whose
  // item_id is another asset in the same list. Returns innermost first.
  function containerChain(locationId) {
    const chain = [];
    const seen = new Set();
    let cur = itemIndex.get(locationId);
    while (cur && !seen.has(cur.item_id)) {
      seen.add(cur.item_id);
      chain.push(cur);
      if (cur.location_type !== 'item') break;
      cur = itemIndex.get(cur.location_id);
    }
    return chain;
  }

  // Return the node an asset should live in (station node for loose items, or the
  // innermost container group it belongs to), creating container branches along the way.
  function homeNodeFor(asset) {
    if (asset.location_type === 'item') {
      const chain = containerChain(asset.location_id);
      if (chain.length) {
        const root = chain[chain.length - 1];
        let rootType = root.location_type;
        if (rootType === 'item' && structureCache[root.location_id] && structureCache[root.location_id].name) rootType = 'structure';
        const node = stationNodeFor(root.location_id, rootType);
        if (!node) return null;
        let cur = node;
        for (let i = chain.length - 1; i >= 0; i--) cur = ensureGroup(cur, chain[i]);
        return cur;
      }
      // No holding asset in the list, but the location resolves to a known structure
      if (structureCache[asset.location_id] && structureCache[asset.location_id].name) {
        return stationNodeFor(asset.location_id, 'structure');
      }
      return null;
    }
    return stationNodeFor(asset.location_id, asset.location_type);
  }

  for (const asset of assets) {
    const node = homeNodeFor(asset);
    if (!node) {
      markUnresolved(asset);
      continue;
    }
    // Containers with resolved contents render as a branch (their group header),
    // so skip adding them as loose leaf items.
    if (groupedIds.has(asset.item_id)) continue;
    node.items.push({
      item_id: asset.item_id,
      type_id: asset.type_id,
      type_name: typeName(asset.type_id),
      quantity: asset.quantity,
      location_type: asset.location_type
    });
  }

  for (const entry of unresolvedMap.values()) entry.typeName = typeName(entry.typeIds[0]);
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
'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { esiFetch, publicFetch, publicPost } = require('../eve/http');

const universeCache = new Map();

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

async function fetchAllPages(baseUrl, accessToken) {
  const all = [];
  let page = 1;
  const maxPages = 100;

  while (page <= maxPages) {
    const url = `${baseUrl}?page=${page}`;
    const data = accessToken
      ? await esiFetch(url, accessToken)
      : await publicFetch(url);

    if (!Array.isArray(data) || data.length === 0) break;

    all.push(...data);

    if (data.length < 1000) break;
    page++;
  }

  return all;
}

async function getCharacterAssets(characterId, accessToken) {
  return fetchAllPages(`/characters/${characterId}/assets/`, accessToken);
}

async function getCorpAssets(corpId, accessToken) {
  return fetchAllPages(`/corporations/${corpId}/assets/`, accessToken);
}

// --- Shared persistent structure cache ---

const STRUCTURE_TTL_MS = 7 * 24 * 3600 * 1000;
const STRUCTURE_FAIL_TTL_MS = 60 * 60 * 1000; // don't retry 403s for an hour

let structureDiskCache = null;

function structureCacheFile() {
  return path.join(app.getPath('userData'), 'structure-names.json');
}

function getStructureDiskCache() {
  if (structureDiskCache) return structureDiskCache;
  try {
    structureDiskCache =
      JSON.parse(fs.readFileSync(structureCacheFile(), 'utf8')) || {};
  } catch {
    structureDiskCache = {};
  }
  return structureDiskCache;
}

function writeStructureDiskCache() {
  try {
    fs.mkdirSync(path.dirname(structureCacheFile()), { recursive: true });
    fs.writeFileSync(
      structureCacheFile(),
      JSON.stringify(structureDiskCache || {}, null, 2),
      'utf8'
    );
  } catch {
    // Ignore write errors.
  }
}

function setStructureDiskCacheEntry(structureId, entry) {
  const cache = getStructureDiskCache();
  cache[String(structureId)] = {
    name: entry.name,
    systemId: entry.systemId != null ? entry.systemId : null,
    savedAt: Date.now()
  };
  writeStructureDiskCache();
}

function markStructureFailed(structureId) {
  const cache = getStructureDiskCache();
  const key = String(structureId);
  const prev = cache[key] || {};
  cache[key] = {
    name: prev.name || null,
    systemId: prev.systemId != null ? prev.systemId : null,
    savedAt: prev.savedAt || 0,
    failedAt: Date.now()
  };
  writeStructureDiskCache();
}

// --- Universe lookups (cached per run) ---

async function cachedFetch(key, fn) {
  if (universeCache.has(key)) return universeCache.get(key);

  const value = await fn();
  universeCache.set(key, value);
  return value;
}

// Concurrency-limited map: no more than `limit` ESI calls in flight
async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let index = 0;

  const workers = Array.from(
    { length: Math.max(1, Math.min(limit, items.length)) },
    async () => {
      while (index < items.length) {
        const i = index++;
        results[i] = await fn(items[i], i);
      }
    }
  );

  await Promise.all(workers);
  return results;
}

async function getSystemInfo(systemId) {
  return cachedFetch(`system:${systemId}`, async () => {
    try {
      const sys = await publicFetch(`/universe/systems/${systemId}/`);
      return {
        name: sys.name || `System ${systemId}`,
        constellationId:
          sys.constellation_id != null ? Number(sys.constellation_id) : null
      };
    } catch {
      return { name: `System ${systemId}`, constellationId: null };
    }
  });
}

async function getConstellationInfo(constellationId) {
  return cachedFetch(`constellation:${constellationId}`, async () => {
    try {
      const con = await publicFetch(
        `/universe/constellations/${constellationId}/`
      );
      return {
        name: con.name || `Constellation ${constellationId}`,
        regionId: con.region_id != null ? Number(con.region_id) : null
      };
    } catch {
      return { name: `Constellation ${constellationId}`, regionId: null };
    }
  });
}

async function getRegionName(regionId) {
  return cachedFetch(`region:${regionId}`, async () => {
    try {
      const region = await publicFetch(`/universe/regions/${regionId}/`);
      return region.name || `Region ${regionId}`;
    } catch {
      return `Region ${regionId}`;
    }
  });
}

async function getStationInfo(stationId) {
  return cachedFetch(`station:${stationId}`, async () => {
    try {
      const station = await publicFetch(`/universe/stations/${stationId}/`);
      return {
        name: station.name || `Station ${stationId}`,
        systemId: station.system_id != null ? Number(station.system_id) : null
      };
    } catch {
      return { name: `Station ${stationId}`, systemId: null };
    }
  });
}

// Structures: only hit the authenticated endpoint when the token actually
// has esi-universe.read_structures.v1 AND we haven't recently 403'd this id.
// Everything else falls back to disk cache / /universe/names/ (no errors).
async function getStructureInfo(structureId, accessToken, canReadStructures) {
  return cachedFetch(`structure:${structureId}`, async () => {
    const disk = getStructureDiskCache();
    const hit = disk[String(structureId)];
    const now = Date.now();
    const fresh =
      hit && hit.name && now - (hit.savedAt || 0) < STRUCTURE_TTL_MS;
    const recentlyFailed =
      hit && hit.failedAt && now - hit.failedAt < STRUCTURE_FAIL_TTL_MS;

    if (fresh && hit.systemId != null) {
      return { name: hit.name, systemId: Number(hit.systemId) };
    }

    if (canReadStructures && !recentlyFailed) {
      try {
        const structure = await esiFetch(
          `/universe/structures/${structureId}/`,
          accessToken
        );
        const entry = {
          name: structure.name || `Structure ${structureId}`,
          systemId:
            structure.solar_system_id != null
              ? Number(structure.solar_system_id)
              : null
        };
        setStructureDiskCacheEntry(structureId, entry);
        return entry;
      } catch {
        markStructureFailed(structureId);
      }
    }

    if (fresh && hit.systemId == null) {
      return { name: hit.name, systemId: null };
    }

    try {
      const arr = await publicPost('/universe/names/', [structureId]);
      const found = Array.isArray(arr)
        ? arr.find((x) => Number(x.id) === Number(structureId))
        : null;
      if (found && found.name) {
        setStructureDiskCacheEntry(structureId, {
          name: found.name,
          systemId: null
        });
        return { name: found.name, systemId: null };
      }
    } catch {
      // fall through
    }

    if (hit && hit.name) {
      return {
        name: hit.name,
        systemId: hit.systemId != null ? Number(hit.systemId) : null
      };
    }

    return { name: `Structure ${structureId}`, systemId: null };
  });
}

async function systemAndRegion(systemId) {
  if (systemId == null) {
    return { systemName: 'Unknown System', regionName: 'Unknown Region' };
  }

  const system = await getSystemInfo(systemId);

  let regionId = null;
  if (system.constellationId != null) {
    const constellation = await getConstellationInfo(system.constellationId);
    regionId = constellation.regionId;
  }

  const regionName = regionId != null
    ? await getRegionName(regionId)
    : 'Unknown Region';

  return { systemName: system.name, regionName };
}

// --- Active ship context ---

function base64UrlToString(value) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const normalized = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(normalized, 'base64').toString('utf8');
}

function characterIdFromAccessToken(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length < 2) return null;

    const payload = JSON.parse(base64UrlToString(parts[1]));
    const sub = payload.sub || '';

    const match = String(sub).match(/CHARACTER:EVE:(\d+)/i);
    if (match) return Number(match[1]);

    if (payload.character_id != null) return Number(payload.character_id);
  } catch {
    // Ignore decode failures.
  }

  return null;
}

async function resolveLocationObject(location, accessToken, canReadStructures) {
  if (!location) {
    return {
      regionName: 'Unknown Region',
      systemName: 'Unknown System',
      locationName: 'Unknown location'
    };
  }

  if (location.station_id != null) {
    const station = await getStationInfo(Number(location.station_id));
    const { systemName, regionName } = await systemAndRegion(station.systemId);
    return { regionName, systemName, locationName: station.name };
  }

  if (location.structure_id != null) {
    const structure = await getStructureInfo(
      Number(location.structure_id),
      accessToken,
      canReadStructures
    );
    const { systemName, regionName } = await systemAndRegion(structure.systemId);
    return { regionName, systemName, locationName: structure.name };
  }

  if (location.solar_system_id != null) {
    const { systemName, regionName } = await systemAndRegion(
      Number(location.solar_system_id)
    );
    return { regionName, systemName, locationName: `${systemName} (space)` };
  }

  return {
    regionName: 'Unknown Region',
    systemName: 'Unknown System',
    locationName: 'Unknown location'
  };
}

async function getActiveShipContext(accessToken, canReadStructures) {
  const characterId = characterIdFromAccessToken(accessToken);
  if (!characterId) return null;

  let ship = null;
  let location = null;

  try {
    ship = await esiFetch(`/characters/${characterId}/ship/`, accessToken);
  } catch {
    ship = null;
  }

  if (!ship || ship.ship_item_id == null) return null;

  try {
    location = await esiFetch(
      `/characters/${characterId}/location/`,
      accessToken
    );
  } catch {
    location = null;
  }

  const resolved = await resolveLocationObject(
    location,
    accessToken,
    canReadStructures
  );

  return {
    shipItemId: Number(ship.ship_item_id),
    shipName: ship.ship_name || 'Active ship',
    regionName: resolved.regionName,
    systemName: resolved.systemName,
    locationName: `${ship.ship_name || 'Active ship'} (active ship)`
  };
}

// --- Missing parent recovery ---

async function resolveMissingParent(
  parentId,
  accessToken,
  activeShipContext,
  canReadStructures
) {
  return cachedFetch(`parent:${parentId}`, async () => {
    if (
      activeShipContext &&
      Number(parentId) === Number(activeShipContext.shipItemId)
    ) {
      return {
        regionName: activeShipContext.regionName,
        systemName: activeShipContext.systemName,
        locationName: activeShipContext.locationName
      };
    }

    let category = null;
    let name = null;
    try {
      const arr = await publicPost('/universe/names/', [parentId]);
      const hit = Array.isArray(arr)
        ? arr.find((x) => Number(x.id) === Number(parentId))
        : null;
      if (hit) {
        category = hit.category || null;
        name = hit.name || null;
      }
    } catch {
      // category stays null
    }

    if (category === 'station') {
      const station = await getStationInfo(parentId);
      const { systemName, regionName } = await systemAndRegion(station.systemId);
      return { regionName, systemName, locationName: station.name };
    }

    if (category === 'structure' || category === null) {
      const structure = await getStructureInfo(
        parentId,
        accessToken,
        canReadStructures
      );
      const { systemName, regionName } = await systemAndRegion(
        structure.systemId
      );
      return { regionName, systemName, locationName: name || structure.name };
    }

    return {
      regionName: 'Carried / in transit',
      systemName: 'Missing parent container',
      locationName: name || `Container ${parentId}`
    };
  });
}

// --- Asset location resolution ---

async function resolveAssetLocation(
  asset,
  assetsByItemId,
  accessToken,
  activeShipContext,
  canReadStructures
) {
  let cur = asset;
  let missingParentId = null;
  const seen = new Set();

  while (cur && cur.location_type === 'item') {
    if (seen.has(cur.item_id)) {
      missingParentId = cur.location_id;
      break;
    }

    seen.add(cur.item_id);

    const parent = assetsByItemId.get(cur.location_id);
    if (!parent) {
      missingParentId = cur.location_id;
      cur = null;
      break;
    }

    cur = parent;
  }

  if (!cur || cur.location_type === 'item') {
    if (missingParentId != null) {
      return resolveMissingParent(
        missingParentId,
        accessToken,
        activeShipContext,
        canReadStructures
      );
    }

    return {
      regionName: 'Carried / in transit',
      systemName: 'Missing parent container',
      locationName: 'Container / ship contents'
    };
  }

  const locId = cur.location_id;
  const locType = cur.location_type;

  if (locType === 'station') {
    const station = await getStationInfo(locId);
    const { systemName, regionName } = await systemAndRegion(station.systemId);
    return { regionName, systemName, locationName: station.name };
  }

  if (locType === 'structure' || locType === 'other') {
    const structure = await getStructureInfo(locId, accessToken, canReadStructures);
    const { systemName, regionName } = await systemAndRegion(structure.systemId);
    return { regionName, systemName, locationName: structure.name };
  }

  if (locType === 'solar_system') {
    const { systemName, regionName } = await systemAndRegion(locId);
    return { regionName, systemName, locationName: `${systemName} (space)` };
  }

  return {
    regionName: 'Unknown Region',
    systemName: 'Unknown System',
    locationName: `Location ${locId}`
  };
}

async function buildAssetTree(assets, accessToken, canReadStructures) {
  const list = Array.isArray(assets) ? assets : [];

  const assetsByItemId = new Map();
  for (const asset of list) {
    assetsByItemId.set(asset.item_id, asset);
  }

  let activeShipContext = null;
  try {
    activeShipContext = await getActiveShipContext(
      accessToken,
      canReadStructures
    );
  } catch {
    activeShipContext = null;
  }

  const tree = { regions: {} };
  const chunkSize = 500;

  for (let i = 0; i < list.length; i += chunkSize) {
    const chunk = list.slice(i, i + chunkSize);

    // Max 10 concurrent ESI lookups — no more 500-wide bursts
    const resolved = await mapLimit(chunk, 10, async (asset) => {
      const loc = await resolveAssetLocation(
        asset,
        assetsByItemId,
        accessToken,
        activeShipContext,
        canReadStructures
      );
      return { asset, loc };
    });

    for (const { asset, loc } of resolved) {
      const region = loc.regionName || 'Unknown Region';
      const system = loc.systemName || 'Unknown System';
      const station = loc.locationName || 'Unknown location';

      if (!tree.regions[region]) {
        tree.regions[region] = { name: region, systems: {} };
      }
      if (!tree.regions[region].systems[system]) {
        tree.regions[region].systems[system] = { name: system, stations: {} };
      }
      if (!tree.regions[region].systems[system].stations[station]) {
        tree.regions[region].systems[system].stations[station] = {
          name: station,
          items: [],
          count: 0
        };
      }

      const st = tree.regions[region].systems[system].stations[station];
      st.items.push({
        typeId: asset.type_id,
        quantity: asset.quantity,
        isSingleton: asset.is_singleton,
        itemId: asset.item_id
      });
      st.count++;
    }

    await new Promise((resolve) => setImmediate(resolve));
  }

  return tree;
}

module.exports = {
  getCharacterAssets,
  getCorpAssets,
  buildAssetTree,
  getPersonalCache,
  getCorpCache,
  savePersonalCache,
  saveCorpCache
};
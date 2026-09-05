// FILE: main/assets-resolve.js
// VERSION: 1.1.16-beta
'use strict';
const { esiFetch } = require('../eve/http');
const accounts = require('./accounts');
const { diagReset, diagRecord, getDiag } = require('./assets-diag');
const { getStructureInfo, primeCorpStructureSystems, getCorpStructureSystems } = require('./assets-structures');
const { getStationInfo, getPlanetInfo, systemAndRegion, batchResolveNames, flushUniverseDisk } = require('./assets-universe');
const { flushStructureDiskCache } = require('./assets-structures');

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

function walkToTop(asset, assetsByItemId, corpAssetsByItemId) {
  let cur = asset;
  let missingParentId = null;
  const seen = new Set();

  while (cur && cur.location_type === 'item') {
    const curId = Number(cur.item_id);
    if (seen.has(curId)) {
      missingParentId = cur.location_id;
      break;
    }
    seen.add(curId);
    const id = Number(cur.location_id);
    let parent = assetsByItemId.get(id);
    if (!parent && corpAssetsByItemId) {
      parent = corpAssetsByItemId.get(id) || null;
    }
    if (!parent) {
      missingParentId = cur.location_id;
      cur = null;
      break;
    }
    cur = parent;
  }

  return { top: cur, missingParentId };
}

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

async function resolveMissingParent(
  parentId,
  accessToken,
  activeShipContext,
  canReadStructures
) {
  const key = `parent:${parentId}`;
  const { universeCache } = require('./assets-universe');
  if (universeCache.has(key)) return universeCache.get(key);

  const value = await (async () => {
    if (
      activeShipContext &&
      Number(parentId) === Number(activeShipContext.shipItemId)
    ) {
      diagRecord('structure');
      return {
        regionName: activeShipContext.regionName,
        systemName: activeShipContext.systemName,
        locationName: activeShipContext.locationName
      };
    }

    const namesHit = universeCache.get(`names:${parentId}`) || null;
    const category = namesHit ? namesHit.category : null;
    const name = namesHit ? namesHit.name : null;

    if (category === 'station') {
      const station = await getStationInfo(parentId);
      const { systemName, regionName } = await systemAndRegion(station.systemId);
      diagRecord(station.name === `Station ${parentId}` ? 'fallback' : 'station', parentId);
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

    diagRecord('fallback', parentId);
    return {
      regionName: 'Carried / in transit',
      systemName: 'Missing parent container',
      locationName: name || `Container ${parentId}`
    };
  })();

  if (value.regionName !== 'Carried / in transit' || value.systemName !== 'Missing parent container') {
    const { universeCache } = require('./assets-universe');
    universeCache.set(key, value);
  }
  return value;
}

async function resolveAssetLocation(
  asset,
  assetsByItemId,
  accessToken,
  activeShipContext,
  canReadStructures
) {
  const { top, missingParentId } = walkToTop(asset, assetsByItemId);

  if (!top || top.location_type === 'item') {
    if (missingParentId != null) {
      return resolveMissingParent(
        missingParentId,
        accessToken,
        activeShipContext,
        canReadStructures
      );
    }
    diagRecord('fallback');
    return {
      regionName: 'Carried / in transit',
      systemName: 'Missing parent container',
      locationName: 'Container / ship contents'
    };
  }

  const locId = top.location_id;
  const locType = top.location_type;

  if (locType === 'station') {
    const station = await getStationInfo(locId);
    const { systemName, regionName } = await systemAndRegion(station.systemId);
    diagRecord(station.name === `Station ${locId}` ? 'fallback' : 'station', locId);
    return { regionName, systemName, locationName: station.name };
  }

  if (locType === 'structure' || locType === 'other') {
    const structure = await getStructureInfo(locId, accessToken, canReadStructures);
    if (structure.isContainer) {
      const flag = (top.location_flag || '').toLowerCase();
      const label = flag === 'hangar' ? 'Ship in hangar'
        : flag === 'cargohold' ? 'Container in cargo'
        : flag === 'deliveries' ? 'Deliveries'
        : 'Container/ship';
      return {
        regionName: 'Carried / in transit',
        systemName: 'See asset details',
        locationName: `${label} ${locId}`
      };
    }
    const { systemName, regionName } = await systemAndRegion(structure.systemId);
    return { regionName, systemName, locationName: structure.name };
  }

  if (locType === 'solar_system') {
    const flag = (top.location_flag || '').toLowerCase();
    if (flag === 'autofit' || flag === 'deliveries') {
      const planet = await getPlanetInfo(locId);
      const { systemName, regionName } = await systemAndRegion(planet.systemId || locId);
      return { regionName, systemName, locationName: planet.name };
    }
    const { systemName, regionName } = await systemAndRegion(locId);
    return { regionName, systemName, locationName: `${systemName} (space)` };
  }

  return {
    regionName: 'Unknown Region',
    systemName: 'Unknown System',
    locationName: `Location ${locId}`
  };
}

async function buildAssetTree(assets, accessToken, canReadStructures, opts) {
  diagReset();
  const list = Array.isArray(assets) ? assets : [];
  const corpId = opts && opts.corpId != null ? Number(opts.corpId) : null;
  const assetsByItemId = new Map();
  for (const asset of list) {
    assetsByItemId.set(asset.item_id, asset);
  }

  const nameIds = new Set();
  for (const asset of list) {
    const { top, missingParentId } = walkToTop(asset, assetsByItemId);
    if (missingParentId != null) {
      nameIds.add(Number(missingParentId));
    } else if (
      top &&
      (top.location_type === 'structure' || top.location_type === 'other')
    ) {
      nameIds.add(Number(top.location_id));
    }
  }

  if (nameIds.size) {
    await batchResolveNames([...nameIds]);
  }

  try {
    const fallbackStructureSystems = await getCorpStructureSystems(corpId, accessToken);
    // Store in module scope for getStructureInfo to use
    require('./assets-structures').fallbackStructureSystems = fallbackStructureSystems;
  } catch {
    // Fallback map optional; lookups land in Unknown Region instead.
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

  flushUniverseDisk();
  flushStructureDiskCache();

  tree._diag = getDiag();
  return tree;
}

module.exports = {
  walkToTop,
  getActiveShipContext,
  buildAssetTree
};
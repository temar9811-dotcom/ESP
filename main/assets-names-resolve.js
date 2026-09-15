// File: main/assets-names-resolve.js | Version: 1.3
'use strict';
const accounts = require('./accounts');
const assets = require('./assets');
const assetsSync = require('./assets-sync');
const logger = require('./debug-logger');
const { makeTypeLookup, classifyFlag, classifyContainerItem, fetchItemNames } = require('./assets-names-helpers');
const SECTION = 'ASSETS-NAMES';
const isRateLimit = (err) => Boolean(err && (err.status === 420 || err.status === 429));

async function resolveCharacter(account, token) {
  const raw = assetsSync.getRaw(account.characterId);
  if (!raw || !Array.isArray(raw.assets)) {
    logger.warn(SECTION, 'resolve skipped: no raw assets', { characterId: account.characterId });
    return null;
  }

  const list = raw.assets;
  const byItemId = new Map(list.map((a) => [Number(a.item_id), a]));
  if (typeof assets.clearStructureFailures === 'function') assets.clearStructureFailures();

  let corpByItemId = null;
  try {
    const corpId = account.corporationId || null;
    if (corpId) {
      const corpRaw = assetsSync.getCorpRaw(corpId);
      if (corpRaw && Array.isArray(corpRaw.assets) && corpRaw.assets.length) corpByItemId = assets.buildCorpMap(corpRaw.assets);
    }
  } catch { corpByItemId = null; }

  accounts.ensureScopes(account);
  const scopes = typeof account.scopes === 'string' ? account.scopes.split(' ').filter(Boolean) : Array.isArray(account.scopes) ? account.scopes : null;
  const canReadStructures = scopes == null || scopes.includes('esi-universe.read_structures.v1');

  const locations = {};
  const resolved = new Set();
  const typeOf = makeTypeLookup();
  const nameIds = new Set();
  const typeIds = new Set();

  for (const asset of list) {
    const { top, missingParentId } = assets.walkToTop(asset, byItemId, corpByItemId);
    if (top && (top.location_type === 'structure' || top.location_type === 'other')) nameIds.add(Number(top.location_id));
    if (!top && missingParentId != null) nameIds.add(Number(missingParentId));
    if (asset.type_id != null) typeIds.add(Number(asset.type_id));
  }

  logger.debug(SECTION, 'resolve pass 1', {
    characterId: account.characterId,
    assets: list.length,
    nameIds: nameIds.size,
    typeIds: typeIds.size
  });

  const resolveIds = [...new Set([...nameIds, ...typeIds])];
  if (resolveIds.length) await assets.batchResolveNames(resolveIds);
  if (account.corporationId) await assets.primeCorpStructureSystems(account.corporationId, token);

  const itemNames = new Map();
  try {
    const fetched = await fetchItemNames(account.characterId, list.map((a) => Number(a.item_id)), token);
    for (const [id, name] of fetched) itemNames.set(id, name);
  } catch (err) {
    if (isRateLimit(err)) throw err;
    logger.warn(SECTION, 'fetchItemNames failed', { error: err?.message || String(err) });
  }

  let activeShip = null;
  try {
    activeShip = await assets.getActiveShipContext(token, canReadStructures);
  } catch (err) {
    if (isRateLimit(err)) throw err;
    activeShip = null;
  }

  logger.debug(SECTION, 'resolve pass 2', {
    characterId: account.characterId,
    itemNames: itemNames.size,
    activeShip: Boolean(activeShip)
  });

  for (const asset of list) {
    const { top, missingParentId } = assets.walkToTop(asset, byItemId, corpByItemId);

    if (!top) {
      const id = missingParentId != null ? Number(missingParentId) : Number(asset.location_id);
      if (resolved.has(id)) continue;
      resolved.add(id);

      if (activeShip && Number(activeShip.shipItemId) === id) {
        locations[id] = {
          kind: 'ship',
          name: `${activeShip.shipName} (active ship)`,
          systemName: activeShip.systemName || 'Unknown System',
          regionName: activeShip.regionName || 'Unknown Region'
        };
        continue;
      }

      try {
        const structure = await assets.getStructureInfo(id, token, canReadStructures);
        if (!structure.isContainer) {
          const generic = structure.name === `Structure ${id}`;
          const { systemName, regionName } = await assets.systemAndRegion(structure.systemId);
          locations[id] = {
            kind: generic ? 'inaccessible-structure' : 'structure',
            name: generic ? `Structure ${id} (no access)` : structure.name,
            systemName,
            regionName
          };
          continue;
        }
      } catch (err) {
        if (isRateLimit(err)) throw err;
        const label = err.status === 403
          ? `Structure ${id} (no access)`
          : err.status === 404
            ? `Structure ${id} (destroyed/unreachable)`
            : `Unknown location ${id}`;
        locations[id] = {
          kind: err.status === 403 ? 'inaccessible-structure' : 'unknown',
          name: label,
          systemName: 'In transit',
          regionName: 'Carried / in transit'
        };
        continue;
      }

      const givenName = itemNames.get(id);
      const flagHit = classifyFlag(asset.location_flag);
      if (flagHit && !givenName) {
        locations[id] = { kind: flagHit.kind, name: flagHit.label, systemName: 'In transit', regionName: 'Carried / in transit' };
        continue;
      }

      const parentRow = byItemId.get(id);
      let kind = 'inaccessible';
      let label = 'Container / ship contents';
      if (parentRow && parentRow.type_id != null) {
        const ti = await typeOf(parentRow.type_id);
        const k = classifyContainerItem(ti);
        if (k === 'ship') { kind = 'ship'; label = `Ship ${ti && ti.name ? ti.name : parentRow.type_id}`; }
        else if (k === 'container') { kind = 'container'; label = `Container ${ti && ti.name ? ti.name : parentRow.type_id}`; }
      }
      if (givenName) {
        label = givenName;
        if (kind === 'inaccessible') kind = 'container';
      }

      locations[id] = { kind, name: label, systemName: 'In transit', regionName: 'Carried / in transit' };
      continue;
    }

    const topType = await typeOf(top.type_id);
    const topKind = classifyContainerItem(topType);
    const key = Number(top.item_id);
    if (resolved.has(key)) continue;
    resolved.add(key);

    if (top.location_type === 'station' && topKind !== 'ship' && topKind !== 'container') {
      const locId = Number(top.location_id);
      const station = await assets.getStationInfo(locId);
      const { systemName, regionName } = await assets.systemAndRegion(station.systemId);
      locations[key] = { kind: 'station', name: station.name, systemName, regionName };
      continue;
    }

    if (topKind === 'ship' || topKind === 'container') {
      const tname = topType && topType.name ? topType.name : String(top.type_id);
      const label = topKind === 'ship' ? 'Ship' : 'Container';
      let place = { name: 'Unknown location', systemName: 'Unknown System', regionName: 'Unknown Region' };
      const parentLocId = Number(top.location_id);

      try {
        if (top.location_type === 'station') {
          const st = await assets.getStationInfo(parentLocId);
          const sr = await assets.systemAndRegion(st.systemId);
          place = { name: st.name, systemName: sr.systemName, regionName: sr.regionName };
        } else if (top.location_type === 'structure' || top.location_type === 'other') {
          const s = await assets.getStructureInfo(parentLocId, token, canReadStructures);
          if (!s.isContainer) {
            const sr = await assets.systemAndRegion(s.systemId);
            place = { name: s.name, systemName: sr.systemName, regionName: sr.regionName };
          }
        } else if (top.location_type === 'solar_system') {
          const sr = await assets.systemAndRegion(parentLocId);
          place = { name: `${sr.systemName} (space)`, systemName: sr.systemName, regionName: sr.regionName };
        }
      } catch (err) {
        if (isRateLimit(err)) throw err;
      }

      locations[key] = {
        kind: topKind,
        name: `${label} ${tname}`,
        systemName: place.systemName,
        regionName: place.regionName,
        locationName: place.name
      };
      continue;
    }

    if (top.location_type === 'solar_system') {
      const locId = Number(top.location_id);
      const flag0 = String(top.location_flag || '').toLowerCase();
      if (flag0 === 'autofit' || flag0 === 'deliveries') {
        const planet = await assets.getPlanetInfo(locId);
        const { systemName, regionName } = await assets.systemAndRegion(planet.systemId || locId);
        locations[key] = { kind: 'planet', name: planet.name, systemName, regionName };
      } else {
        const { systemName, regionName } = await assets.systemAndRegion(locId);
        locations[key] = { kind: 'solar_system', name: `${systemName} (space)`, systemName, regionName };
      }
      continue;
    }

    const locId = Number(top.location_id);
    const structure = await assets.getStructureInfo(locId, token, canReadStructures);
    if (structure.isContainer) {
      locations[key] = {
        kind: topKind === 'structure' ? 'structure' : 'container',
        name: topKind === 'structure' ? `Structure ${locId} (no access)` : `Container ${locId}`,
        systemName: 'See asset details',
        regionName: 'Carried / in transit'
      };
      continue;
    }

    const generic = structure.name === `Structure ${locId}`;
    const { systemName, regionName } = await assets.systemAndRegion(structure.systemId);
    locations[key] = {
      kind: generic ? 'inaccessible-structure' : 'structure',
      name: generic ? `Structure ${locId} (no access)` : structure.name,
      systemName,
      regionName
    };
  }

  const items = Object.fromEntries(itemNames);
  const types = {};
  for (const id of typeIds) {
    const found = assets.getCachedName ? await assets.getCachedName(id) : null;
    const name = typeof found === 'string' ? found : found?.name;
    if (name) types[id] = name;
  }

  logger.debug(SECTION, 'resolve complete', {
    characterId: account.characterId,
    locations: Object.keys(locations).length,
    items: Object.keys(items).length,
    types: Object.keys(types).length
  });

  return { locations, items, types, fetchedAt: new Date().toISOString() };
}

module.exports = { resolveCharacter };
'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const accounts = require('./accounts');
const sequencer = require('./esi-sequencer');
const debug = require('./debug');
const assets = require('./assets');
const assetsSync = require('./assets-sync');
const eveConfig = require('../eve/config');
const { publicFetch } = require('../eve/http');

// Sequenced asset name resolution — runs after the raw asset pull and
// re-resolves every 24 hours. It walks the raw asset cache, classifies
// each top-level location (station / player structure / planet / ship /
// container / inaccessible structure), and resolves names through the
// shared universe caches in assets.js. All ESI access goes through the
// sequencer and the same batching / rate-limit rules as the other
// sections.
const SECTION = 'assets-names';

let cache = null;
let pulling = false;
let started = false;
let timer = null;
let lastPullAt = null;
let nextPullAt = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheFile() {
  return path.join(app.getPath('userData'), 'assets-names-cache.json');
}

function loadCache() {
  if (cache) return cache;

  try {
    cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {};
  } catch {
    cache = {};
  }

  if (!cache || typeof cache !== 'object') {
    cache = {};
  }

  if (!cache.characters || typeof cache.characters !== 'object') {
    cache.characters = {};
  }

  return cache;
}

function saveCache() {
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(loadCache()), 'utf8');
  } catch {
    // Ignore cache write errors.
  }
}

function isPulling() {
  return pulling;
}

function resetCache() {
  cache = null;
}

// Resolved location names for one character, or null when absent.
function getNames(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !entry.locations) return null;

  return {
    locations: entry.locations,
    fetchedAt: entry.fetchedAt || null,
    pulling: isPulling()
  };
}

function removeCharacter(characterId) {
  if (cache && cache.characters) {
    delete cache.characters[String(characterId)];
    saveCache();
  }
}

// Cache of type_id -> { categoryId, groupId } so each item type is fetched
// once per resolution pass (SDE data is static, so a fresh fetch each pass
// avoids stale mappings).
function makeTypeLookup() {
  const map = new Map();
  return async function typeOf(typeId) {
    const id = Number(typeId);
    if (!Number.isFinite(id)) return null;
    if (map.has(id)) return map.get(id);
    let info = null;
    try {
      await accounts.waitErrorBudget();
      const t = await publicFetch(`/universe/types/${id}/`);
      info = {
        categoryId: t && t.category_id != null ? Number(t.category_id) : null,
        groupId: t && t.group_id != null ? Number(t.group_id) : null,
        name: t && t.name ? String(t.name) : null
      };
    } catch {
      info = null;
    }
    map.set(id, info);
    return info;
  };
}

// Container group ids (SDE): standard cargo, secure cargo, freight, and
// audit-log containers. Ships are category 6; citadels/structures are
// category 65 (or legacy starbase 23).
const CONTAINER_GROUPS = new Set([12, 90, 155, 1145]);

function classifyContainerItem(typeInfo) {
  if (!typeInfo) return 'unknown';
  if (typeInfo.categoryId === 6) return 'ship';
  if (typeInfo.groupId != null && CONTAINER_GROUPS.has(typeInfo.groupId)) {
    return 'container';
  }
  if (typeInfo.categoryId === 65 || typeInfo.categoryId === 23) return 'structure';
  if (typeInfo.categoryId === 3) return 'station';
  if (typeInfo.categoryId === 2) return 'container'; // celestial container fallback
  return 'unknown';
}

// Classify + resolve one character's raw assets into a location-name map.
// Walks each asset to its top-level location and resolves that once.
async function resolveCharacter(account, token) {
  const raw = assetsSync.getRaw(account.characterId);
  if (!raw || !Array.isArray(raw.assets)) return null;

  const list = raw.assets;
  const byItemId = new Map(list.map((a) => [Number(a.item_id), a]));
  accounts.ensureScopes(account);
  const scopes =
    typeof account.scopes === 'string'
      ? account.scopes.split(' ').filter(Boolean)
      : Array.isArray(account.scopes)
        ? account.scopes
        : null;
  const canReadStructures =
    scopes == null || scopes.includes('esi-universe.read_structures.v1');

  const locations = {}; // location_id -> { kind, name, systemName, regionName }
  const resolved = new Set();
  const typeOf = makeTypeLookup();

  // Pre-pass: seed names for every structure/other location via the public
  // batched /universe/names/ endpoint. It returns names for player
  // structures even when the caller lacks the structures scope, so
  // inaccessible structures still get a real name (marked inaccessible).
  const nameIds = new Set();
  for (const asset of list) {
    const { top } = assets.walkToTop(asset, byItemId);
    if (top && (top.location_type === 'structure' || top.location_type === 'other')) {
      nameIds.add(Number(top.location_id));
    }
  }
  if (nameIds.size) {
    await assets.batchResolveNames([...nameIds]);
  }

  for (const asset of list) {
    const { top, missingParentId } = assets.walkToTop(asset, byItemId);

    // walkToTop returns null only when the parent chain is genuinely absent
    // from the asset list (consumed/moved container, or the active ship,
    // which ESI excludes from /assets/). Classify that missing parent by its
    // own type_id when we have it; otherwise it is in-transit contents.
    if (!top) {
      const id = missingParentId != null ? Number(missingParentId) : Number(asset.location_id);
      if (!resolved.has(id)) {
        resolved.add(id);
        const parentRow = byItemId.get(id);
        let kind = 'inaccessible';
        let label = 'Container / ship contents';
        if (parentRow && parentRow.type_id != null) {
          const ti = await typeOf(parentRow.type_id);
          const k = classifyContainerItem(ti);
          if (k === 'ship') { kind = 'ship'; label = `Ship ${ti && ti.name ? ti.name : parentRow.type_id}`; }
          else if (k === 'container') { kind = 'container'; label = `Container ${ti && ti.name ? ti.name : parentRow.type_id}`; }
        }
        locations[id] = {
          kind,
          name: label,
          systemName: 'In transit',
          regionName: 'Carried / in transit'
        };
      }
      continue;
    }

    // The top of the chain is an asset row. Its type_id tells us what it
    // physically is (ship / container / structure / a plain item sitting in
    // a hangar). Its location_type + location_id tell us WHERE it sits.
    //
    // A container or ship parked in a station reports location_type
    // 'station' (its location_id is the station) — so we must classify by
    // the top asset's OWN type_id first, not by location_type, or every
    // container in a station would be mistaken for the station itself.
    //
    // Every resolved location is keyed by the top asset's OWN item_id, which
    // is what the renderer uses to look entries up (renderer/assets.js).
    const topType = await typeOf(top.type_id);
    const topKind = classifyContainerItem(topType); // ship|container|structure|station|unknown
    const key = Number(top.item_id);
    if (resolved.has(key)) continue;
    resolved.add(key);

    // A genuine NPC station top: the top asset is not a ship/container, and
    // its location_type is station (a loose hangar item or an office).
    if (top.location_type === 'station' && topKind !== 'ship' && topKind !== 'container') {
      const locId = Number(top.location_id);
      const station = await assets.getStationInfo(locId);
      const { systemName, regionName } = await assets.systemAndRegion(station.systemId);
      locations[key] = {
        kind: 'station',
        name: station.name,
        systemName,
        regionName
      };
      continue;
    }

    if (top.location_type === 'solar_system') {
      const locId = Number(top.location_id);
      const flag0 = (top.location_flag || '').toLowerCase();
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

    // A ship or container (wherever it is parked): resolve the place it sits
    // in for context.
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
        }
      } catch { /* leave place as unknown */ }
      locations[key] = {
        kind: topKind,
        name: `${label} ${tname}`,
        systemName: place.systemName,
        regionName: place.regionName,
        locationName: place.name
      };
      continue;
    }

    // structure / other / item: the containing location is an item id (>=1e12)
    // that is a player structure (or outpost/unknown). Resolve its real name.
    {
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
      continue;
    }
  }

  return {
    locations,
    fetchedAt: new Date().toISOString()
  };
}

function store(characterId, result) {
  loadCache().characters[String(characterId)] = result;
}

async function pull() {
  if (pulling) {
    debug.log(SECTION, 'pull requested while one is already running — skipped');
    return { skipped: true };
  }

  pulling = true;
  lastPullAt = Date.now();
  debug.log(SECTION, 'name resolution starting — acquiring the ESI sequencer');
  await sequencer.acquire(SECTION);

  const errors = {};
  let resolved = 0;

  try {
    const list = accounts.getAccounts();
    debug.log(SECTION, `resolving names for ${list.length} character(s)`);

    const batchSize = Math.max(1, Number(eveConfig.ASSETS_NAMES?.batchSize) || 5);
    const batchDelay = Math.max(0, Number(eveConfig.ASSETS_NAMES?.batchDelayMs) || 0);

    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();

      for (const account of batch) {
        const name = account.characterName || account.characterId;
        // Sequential per character to stay gentle on the error budget.
        try {
          const token = await accounts.getValidAccessToken(account, false);
          let result;
          try {
            result = await resolveCharacter(account, token);
          } catch (err) {
            if (err && err.status === 401) {
              const fresh = await accounts.getValidAccessToken(account, true);
              result = await resolveCharacter(account, fresh);
            } else {
              throw err;
            }
          }

          if (result) {
            store(account.characterId, result);
            resolved += 1;
            debug.log(
              SECTION,
              `${name}: resolved ${Object.keys(result.locations).length} location(s)`
            );
          }
        } catch (err) {
          errors[account.characterId] = err?.message || String(err);
          debug.log(
            SECTION,
            `${name}: resolution failed (status ${err?.status ?? 'n/a'}) — ${err?.message || err}`
          );
          if (err && err.status === 420) {
            accounts.enterRateLimit(Number(err.resetSeconds) || 60);
          }
        }
      }

      if (i + batchSize < list.length) {
        await sleep(batchDelay);
      }
    }

    saveCache();
    debug.log(SECTION, `cache saved (${resolved} resolved, ${Object.keys(errors).length} failed)`);
  } finally {
    sequencer.release(SECTION);
    pulling = false;
  }

  debug.log(SECTION, `resolution finished — ${resolved} resolved, ${Object.keys(errors).length} failed`);
  return { resolved, errors };
}

function start() {
  if (started) return;
  started = true;

  debug.log(SECTION, 'startup name resolution scheduled');

  pull().catch((err) =>
    console.error('[assets-names] startup resolution failed', err?.message || err)
  );

  const interval = Math.max(60000, Number(eveConfig.ASSETS_NAMES?.intervalMs) || 24 * 60 * 60 * 1000);
  nextPullAt = Date.now() + interval;
  timer = setInterval(() => {
    debug.log(SECTION, 'scheduled resolution timer fired');
    nextPullAt = Date.now() + interval;
    pull().catch((err) =>
      console.error('[assets-names] scheduled resolution failed', err?.message || err)
    );
  }, interval);
  if (timer.unref) timer.unref();
}

function getSyncState() {
  return {
    pulling,
    lastPullAt,
    nextPullAt,
    intervalMs: Math.max(60000, Number(eveConfig.ASSETS_NAMES?.intervalMs) || 24 * 60 * 60 * 1000)
  };
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  start,
  stop,
  pull,
  isPulling,
  getSyncState,
  resetCache,
  getNames,
  removeCharacter
};

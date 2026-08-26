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

// Classify + resolve one character's raw assets into a location-name map.
// Walks each asset to its top-level location and resolves that once.
async function resolveCharacter(account, token) {
  const raw = assetsSync.getRaw(account.characterId);
  if (!raw || !Array.isArray(raw.assets)) return null;

  const list = raw.assets;
  const byItemId = new Map(list.map((a) => [a.item_id, a]));
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

    // A container/ship whose parent is not itself in the asset list:
    // the containing item is gone (consumed / moved), goods in transit.
    if (!top) {
      const id = missingParentId != null ? Number(missingParentId) : Number(asset.location_id);
      if (!resolved.has(id)) {
        resolved.add(id);
        locations[id] = {
          kind: 'inaccessible',
          name: 'Container / ship contents',
          systemName: 'In transit',
          regionName: 'Carried / in transit'
        };
      }
      continue;
    }

    const locId = Number(top.location_id);
    if (resolved.has(locId)) continue;
    resolved.add(locId);

    const locType = top.location_type;
    const flag = (top.location_flag || '').toLowerCase();

    if (locType === 'station') {
      const station = await assets.getStationInfo(locId);
      resolved.add(locId);
      const { systemName, regionName } = await assets.systemAndRegion(station.systemId);
      locations[locId] = {
        kind: 'station',
        name: station.name,
        systemName,
        regionName
      };
      continue;
    }

    if (locType === 'structure' || locType === 'other') {
      const structure = await assets.getStructureInfo(locId, token, canReadStructures);
      if (structure.isContainer) {
        // A ship or container we have access to (returns no name).
        const label =
          flag === 'hangar' ? 'Ship in hangar'
          : flag === 'cargohold' ? 'Container in cargo'
          : flag === 'deliveries' ? 'Deliveries'
          : 'Container/ship';
        locations[locId] = {
          kind: flag === 'hangar' ? 'ship' : 'container',
          name: `${label} ${locId}`,
          systemName: 'See asset details',
          regionName: 'Carried / in transit'
        };
      } else {
        const generic = structure.name === `Structure ${locId}`;
        const { systemName, regionName } = await assets.systemAndRegion(structure.systemId);
        locations[locId] = {
          // A generic "Structure <id>" name means the structure exists but
          // ESI wouldn't give us its real name (no access) — mark it.
          kind: generic ? 'inaccessible-structure' : 'structure',
          name: generic ? `Structure ${locId} (no access)` : structure.name,
          systemName,
          regionName
        };
      }
      continue;
    }

    if (locType === 'solar_system') {
      // PI assets: flag AutoFit + location_id is the planet, not the system.
      if (flag === 'autofit' || flag === 'deliveries') {
        const planet = await assets.getPlanetInfo(locId);
        const { systemName, regionName } = await assets.systemAndRegion(
          planet.systemId || locId
        );
        locations[locId] = {
          kind: 'planet',
          name: planet.name,
          systemName,
          regionName
        };
      } else {
        const { systemName, regionName } = await assets.systemAndRegion(locId);
        locations[locId] = {
          kind: 'solar_system',
          name: `${systemName} (space)`,
          systemName,
          regionName
        };
      }
      continue;
    }

    // item / fallback
    locations[locId] = {
      kind: 'item',
      name: `Location ${locId}`,
      systemName: 'Unknown System',
      regionName: 'Unknown Region'
    };
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

// FILE: main/assets-structures.js
// VERSION: 1.1.16-beta
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { esiFetch } = require('../eve/http');
const accounts = require('./accounts');
const { throttledEsiFetch, isRateLimit } = require('./assets-throttle');
const { diagRecord } = require('./assets-diag');
const { fetchAllPages } = require('./assets-fetch');
const { universeCache } = require('./assets-universe');

const STRUCTURE_TTL_MS = 7 * 24 * 3600 * 1000;
const STRUCTURE_403_FAIL_MS = 5 * 60 * 1000; // Changed from 24h to 5min
const STRUCTURE_TRANSIENT_FAIL_MS = 10 * 60 * 1000;
const STRUCTURE_LOOKUP_CONCURRENCY = 3;

let structureDiskCache = null;
let structureDiskDirty = false;
let structureDiskTimer = null;
let fallbackStructureSystems = new Map();
const primedCorpSystemCorps = new Set();

function structureCacheFile() {
  return path.join(app.getPath('userData'), 'structure-names.json');
}

function getStructureDiskCache() {
  if (structureDiskCache) return structureDiskCache;
  try {
    structureDiskCache = JSON.parse(fs.readFileSync(structureCacheFile(), 'utf8')) || {};
  } catch {
    structureDiskCache = {};
  }
  const now = Date.now();
  let pruned = false;
  for (const [id, hit] of Object.entries(structureDiskCache)) {
    if (hit && hit.failedUntil == null && hit.failedAt && !hit.name) {
      if (now - hit.failedAt > 24 * 3600 * 1000) {
        delete structureDiskCache[id];
        pruned = true;
      }
    }
  }
  if (pruned) scheduleStructureDiskWrite();
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

function flushStructureDiskCache() {
  structureDiskTimer = null;
  if (!structureDiskDirty) return;
  structureDiskDirty = false;
  writeStructureDiskCache();
}

function scheduleStructureDiskWrite() {
  structureDiskDirty = true;
  if (!structureDiskTimer) {
    structureDiskTimer = setTimeout(flushStructureDiskCache, 2000);
  }
}

function setStructureDiskCacheEntry(structureId, entry) {
  const cache = getStructureDiskCache();
  cache[String(structureId)] = {
    name: entry.name,
    systemId: entry.systemId != null ? entry.systemId : null,
    savedAt: Date.now()
  };
  scheduleStructureDiskWrite();
}

function markStructureFailed(structureId, status, systemId) {
  const cache = getStructureDiskCache();
  const key = String(structureId);
  const prev = cache[key] || {};
  const is403 = Number(status) === 403;
  cache[key] = {
    name: prev.name || null,
    systemId: systemId != null ? Number(systemId) : prev.systemId != null ? prev.systemId : null,
    savedAt: prev.savedAt || 0,
    status: status != null ? status : 'transient',
    failedAt: Date.now(),
    failedUntil: Date.now() + (is403 ? STRUCTURE_403_FAIL_MS : STRUCTURE_TRANSIENT_FAIL_MS)
  };
  scheduleStructureDiskWrite();
}

function createLimiter(max) {
  let active = 0;
  const queue = [];
  return async function limit(task) {
    if (active >= max) {
      await new Promise((resolve) => queue.push(resolve));
    }
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      const resolve = queue.shift();
      if (resolve) resolve();
    }
  };
}

const structureLimit = createLimiter(STRUCTURE_LOOKUP_CONCURRENCY);

function fallbackStructureSystem(structureId) {
  const id = Number(structureId);
  return fallbackStructureSystems.has(id) ? fallbackStructureSystems.get(id) : null;
}

async function getCorpStructureSystems(corpId, accessToken) {
  const out = new Map();
  if (!corpId) return out;
  try {
    const rows = await fetchAllPages(`/corporations/${corpId}/structures/`, accessToken);
    for (const row of rows || []) {
      if (row.structure_id != null && row.system_id != null) {
        out.set(Number(row.structure_id), Number(row.system_id));
      }
    }
  } catch {
    // Corp scope missing or not a member.
  }
  try {
    const rows = await fetchAllPages(`/corporations/${corpId}/starbases/`, accessToken);
    for (const row of rows || []) {
      if (row.starbase_id != null && row.system_id != null) {
        out.set(Number(row.starbase_id), Number(row.system_id));
      }
    }
  } catch {
    // Corp scope missing or not a member.
  }
  return out;
}

async function primeCorpStructureSystems(corpId, accessToken) {
  const id = Number(corpId);
  if (!Number.isFinite(id) || id <= 0) return;
  if (primedCorpSystemCorps.has(id)) return;
  primedCorpSystemCorps.add(id);
  try {
    const map = await getCorpStructureSystems(id, accessToken);
    for (const [sid, sys] of map) {
      fallbackStructureSystems.set(Number(sid), Number(sys));
    }
  } catch {
    // Optional; lookups fall back to Unknown System.
  }
}

async function getStructureInfo(structureId, accessToken, canReadStructures) {
  const key = `structure:${structureId}`;
  if (universeCache.has(key)) return universeCache.get(key);

  const failureUntil = (hit) => {
    if (!hit) return 0;
    if (hit.failedUntil != null) return hit.failedUntil;
    return (hit.failedAt || 0) + 3600000;
  };

  const value = await (async () => {
    const disk = getStructureDiskCache();
    const hit = disk[String(structureId)];
    const now = Date.now();
    const fresh = hit && hit.name && now - (hit.savedAt || 0) < STRUCTURE_TTL_MS;
    const recentlyFailed = failureUntil(hit) > now;

    if (fresh && hit.systemId != null) {
      diagRecord('structure');
      return { name: hit.name, systemId: Number(hit.systemId) };
    }

    if (canReadStructures && !recentlyFailed) {
      try {
        const structure = await structureLimit(() =>
          throttledEsiFetch(`/universe/structures/${structureId}/`, accessToken)
        );
        const entry = {
          name: structure.name || `Structure ${structureId}`,
          systemId: structure.solar_system_id != null ? Number(structure.solar_system_id) : null
        };
        setStructureDiskCacheEntry(structureId, entry);
        diagRecord('structure');
        return entry;
      } catch (err) {
        if (isRateLimit(err)) {
          accounts.enterRateLimit(Number(err.resetSeconds) || 60);
          throw err;
        }
        markStructureFailed(
          structureId,
          err && err.status,
          fallbackStructureSystem(structureId)
        );
      }
    }

    if (fresh && hit.systemId == null) {
      const known = fallbackStructureSystem(structureId);
      diagRecord('structure');
      return {
        name: hit.name,
        systemId: known != null ? Number(known) : null
      };
    }

    const namesHit = universeCache.get(`names:${structureId}`) || null;
    if (namesHit && namesHit.name) {
      if (!hit || !hit.name) {
        setStructureDiskCacheEntry(structureId, {
          name: namesHit.name,
          systemId: fallbackStructureSystem(structureId)
        });
      }
      diagRecord('names');
      return { name: namesHit.name, systemId: null };
    }

    if (hit && hit.name) {
      diagRecord('structure');
      return {
        name: hit.name,
        systemId: hit.systemId != null ? Number(hit.systemId) : null
      };
    }

    const knownSystem =
      (hit && hit.systemId != null && Number(hit.systemId)) ||
      fallbackStructureSystem(structureId);

    if (knownSystem != null && hit && hit.systemId == null) {
      hit.systemId = knownSystem;
      scheduleStructureDiskWrite();
    }

    const seededName = universeCache.get(`names:${structureId}`);
    if (seededName && seededName.name) {
      diagRecord('names');
      return {
        name: seededName.name,
        systemId: knownSystem != null ? Number(knownSystem) : null
      };
    }

    if (knownSystem == null) {
      diagRecord('container');
      return { name: `Container/ship ${structureId}`, systemId: null, isContainer: true };
    }

    diagRecord('fallback', structureId);
    return { name: `Structure ${structureId}`, systemId: knownSystem };
  })();

  const fallbackId = value && value.name === `Structure ${structureId}` ? structureId : null;
  if (fallbackId == null) {
    universeCache.set(key, value);
  }
  return value;
}

async function probeStructure(structureId, accessToken) {
  try {
    const data = await structureLimit(() =>
      throttledEsiFetch(`/universe/structures/${structureId}/`, accessToken)
    );
    return {
      ok: true,
      name: data.name || null,
      systemId: data.solar_system_id != null ? Number(data.solar_system_id) : null
    };
  } catch (err) {
    return {
      ok: false,
      status: err && err.status != null ? err.status : null,
      error: err && err.message ? String(err.message) : String(err)
    };
  }
}

function clearStructureFailures() {
  const cache = getStructureDiskCache();
  let removed = 0;
  for (const [id, entry] of Object.entries(cache)) {
    if (entry && entry.failedAt != null && !entry.name) {
      delete cache[id];
      removed++;
    }
  }
  if (removed) writeStructureDiskCache();
  return removed;
}

module.exports = {
  getStructureInfo,
  probeStructure,
  clearStructureFailures,
  getStructureDiskCache,
  flushStructureDiskCache,
  primeCorpStructureSystems,
  fallbackStructureSystem,
  getCorpStructureSystems
};
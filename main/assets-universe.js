// FILE: main/assets-universe.js
// VERSION: 1.1.16-beta
'use strict';
const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { publicFetch, publicPost } = require('../eve/http');
const { isRateLimit } = require('./assets-throttle');

const UNIVERSE_TTL_MS = 30 * 24 * 3600 * 1000;
const universeCache = new Map();
let universeDisk = null;
let universeDiskDirty = false;
let universeDiskTimer = null;

function universeCacheFile() {
  return path.join(app.getPath('userData'), 'universe-cache.json');
}

function getUniverseDisk() {
  if (universeDisk) return universeDisk;
  try {
    universeDisk = JSON.parse(fs.readFileSync(universeCacheFile(), 'utf8')) || {};
  } catch {
    universeDisk = {};
  }
  return universeDisk;
}

function flushUniverseDisk() {
  universeDiskTimer = null;
  if (!universeDiskDirty) return;
  universeDiskDirty = false;
  try {
    fs.mkdirSync(path.dirname(universeCacheFile()), { recursive: true });
    fs.writeFileSync(
      universeCacheFile(),
      JSON.stringify(universeDisk || {}, null, 2),
      'utf8'
    );
  } catch {
    // Ignore write errors.
  }
}

function setUniverseDiskEntry(section, id, value) {
  const disk = getUniverseDisk();
  if (!disk[section]) disk[section] = {};
  disk[section][String(id)] = { value, savedAt: Date.now() };
  universeDiskDirty = true;
  if (!universeDiskTimer) {
    universeDiskTimer = setTimeout(flushUniverseDisk, 2000);
  }
}

async function persistLookup(key, section, id, fetcher, makeFallback) {
  if (universeCache.has(key)) return universeCache.get(key);
  const disk = getUniverseDisk();
  const hit = (disk[section] || {})[String(id)];
  if (hit && hit.value && Date.now() - (hit.savedAt || 0) < UNIVERSE_TTL_MS) {
    universeCache.set(key, hit.value);
    return hit.value;
  }
  try {
    const value = await fetcher();
    universeCache.set(key, value);
    setUniverseDiskEntry(section, id, value);
    return value;
  } catch (err) {
    if (isRateLimit(err)) throw err;
    return makeFallback();
  }
}

async function getSystemInfo(systemId) {
  return persistLookup(`system:${systemId}`, 'system', systemId, async () => {
    const sys = await publicFetch(`/universe/systems/${systemId}/`);
    return {
      name: sys.name || `System ${systemId}`,
      constellationId: sys.constellation_id != null ? Number(sys.constellation_id) : null
    };
  }, () => ({ name: `System ${systemId}`, constellationId: null }));
}

async function getConstellationInfo(constellationId) {
  return persistLookup(
    `constellation:${constellationId}`,
    'constellation',
    constellationId,
    async () => {
      const con = await publicFetch(`/universe/constellations/${constellationId}/`);
      return {
        name: con.name || `Constellation ${constellationId}`,
        regionId: con.region_id != null ? Number(con.region_id) : null
      };
    },
    () => ({ name: `Constellation ${constellationId}`, regionId: null })
  );
}

async function getRegionName(regionId) {
  return persistLookup(`region:${regionId}`, 'region', regionId, async () => {
    const region = await publicFetch(`/universe/regions/${regionId}/`);
    return region.name || `Region ${regionId}`;
  }, () => `Region ${regionId}`);
}

async function getPlanetInfo(planetId) {
  return persistLookup(
    `planet:${planetId}`,
    'planets',
    planetId,
    async () => {
      const planet = await publicFetch(`/universe/planets/${planetId}/`);
      return {
        name: planet.name || `Planet ${planetId}`,
        systemId: planet.system_id != null ? Number(planet.system_id) : null
      };
    },
    () => ({ name: `Planet ${planetId}`, systemId: null })
  );
}

async function getStationInfo(stationId) {
  return persistLookup(`station:${stationId}`, 'station', stationId, async () => {
    const station = await publicFetch(`/universe/stations/${stationId}/`);
    return {
      name: station.name || `Station ${stationId}`,
      systemId: station.system_id != null ? Number(station.system_id) : null
    };
  }, () => ({ name: `Station ${stationId}`, systemId: null }));
}

async function batchResolveNames(ids) {
  const missing = ids.filter(
    (id) => id != null && !universeCache.has(`names:${id}`)
  );
  if (!missing.length) return;

  const chunkSize = 1000;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    try {
      const arr = await publicPost('/universe/names/', chunk);
      for (const hit of arr || []) {
        universeCache.set(`names:${Number(hit.id)}`, {
          name: hit.name,
          category: hit.category || null
        });
      }
      for (const id of chunk) {
        if (!universeCache.has(`names:${id}`)) {
          universeCache.set(`names:${id}`, null);
        }
      }
    } catch (err) {
      if (isRateLimit(err)) throw err;
    }
  }
}

function getCachedName(id) {
  return universeCache.get(`names:${Number(id)}`) || null;
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

module.exports = {
  getSystemInfo,
  getConstellationInfo,
  getRegionName,
  getPlanetInfo,
  getStationInfo,
  batchResolveNames,
  getCachedName,
  systemAndRegion,
  flushUniverseDisk,
  universeCache
};
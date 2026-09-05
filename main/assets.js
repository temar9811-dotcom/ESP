// FILE: main/assets.js
// VERSION: 1.1.16-beta
'use strict';
const { esiFetch } = require('../eve/http');
const accounts = require('./accounts');

// Re-export everything from the split modules
const throttle = require('./assets-throttle');
const diag = require('./assets-diag');
const cache = require('./assets-cache');
const fetch = require('./assets-fetch');
const universe = require('./assets-universe');
const structures = require('./assets-structures');
const resolve = require('./assets-resolve');

// Corp asset access requires more than the scope: the character needs the
// Director role or a hangar take role. Checking /characters/{id}/roles/
// upfront avoids burning 403s on scope-only characters. Cached per session.
const roleAccessCache = new Map();
const CORPS_ASSET_ROLES = new Set([
  'Director',
  'Hangar_Take_1', 'Hangar_Take_2', 'Hangar_Take_3', 'Hangar_Take_4',
  'Hangar_Take_5', 'Hangar_Take_6', 'Hangar_Take_7',
  'Hangar_Query_1', 'Hangar_Query_2', 'Hangar_Query_3', 'Hangar_Query_4',
  'Hangar_Query_5', 'Hangar_Query_6', 'Hangar_Query_7'
]);

async function canAccessCorpAssets(characterId, accessToken) {
  const key = Number(characterId);
  if (roleAccessCache.has(key)) return roleAccessCache.get(key);

  let allowed = false;
  try {
    const roles = await esiFetch(`/characters/${key}/roles/`, accessToken);
    const list = roles && Array.isArray(roles.roles) ? roles.roles : [];
    allowed = list.some((role) => CORPS_ASSET_ROLES.has(role));
  } catch {
    allowed = false;
  }

  roleAccessCache.set(key, allowed);
  return allowed;
}

async function getCharacterInfoPublic(characterId) {
  const { publicFetch } = require('../eve/http');
  return publicFetch(`/characters/${characterId}/`);
}

function buildCorpMap(rows) {
  const map = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    if (row && row.item_id != null) map.set(Number(row.item_id), row);
  }
  return map;
}

module.exports = {
  // From assets-throttle.js
  throttledEsiFetch: throttle.throttledEsiFetch,
  waitErrorBudget: throttle.waitErrorBudget,
  isRateLimit: throttle.isRateLimit,

  // From assets-diag.js
  diagReset: diag.diagReset,
  diagRecord: diag.diagRecord,
  getDiag: diag.getDiag,

  // From assets-cache.js
  getPersonalCache: cache.getPersonalCache,
  getCorpCache: cache.getCorpCache,
  savePersonalCache: cache.savePersonalCache,
  saveCorpCache: cache.saveCorpCache,

  // From assets-fetch.js
  getCharacterAssets: fetch.getCharacterAssets,
  getCorpAssets: fetch.getCorpAssets,

  // From assets-universe.js
  getSystemInfo: universe.getSystemInfo,
  getConstellationInfo: universe.getConstellationInfo,
  getRegionName: universe.getRegionName,
  getPlanetInfo: universe.getPlanetInfo,
  getStationInfo: universe.getStationInfo,
  batchResolveNames: universe.batchResolveNames,
  getCachedName: universe.getCachedName,
  systemAndRegion: universe.systemAndRegion,
  flushUniverseDisk: universe.flushUniverseDisk,

  // From assets-structures.js
  getStructureInfo: structures.getStructureInfo,
  probeStructure: structures.probeStructure,
  clearStructureFailures: structures.clearStructureFailures,
  getStructureDiskCache: structures.getStructureDiskCache,
  flushStructureDiskCache: structures.flushStructureDiskCache,
  primeCorpStructureSystems: structures.primeCorpStructureSystems,
  fallbackStructureSystem: structures.fallbackStructureSystem,
  getCorpStructureSystems: structures.getCorpStructureSystems,

  // From assets-resolve.js
  walkToTop: resolve.walkToTop,
  getActiveShipContext: resolve.getActiveShipContext,
  buildAssetTree: resolve.buildAssetTree,

  // Local functions
  canAccessCorpAssets,
  getCharacterInfoPublic,
  buildCorpMap
};
// main/pullers/clones-data.js
// VERSION: 1.3
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

const CACHE_FILE = 'clones-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('CLONES-DATA', 'Save failed', { error: e.message }); }
}

async function pullCharacter(account, priority) {
  loadCache();
  const baseUrl = 'https://esi.evetech.net/latest';
  const clonesUrl = `${baseUrl}/characters/${account.characterId}/clones/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);
  async function makeRequest(url) {
    try { return await fetcher.request(url, token); } 
    catch (err) {
      if (err.status === 401) {
        logger.warn('CLONES-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const clonesRes = await makeRequest(clonesUrl);
  const data = clonesRes.data;

  const stationIds = [];
  const structureIds = [];

  const home = data.home_location ? {
    location_id: data.home_location.location_id,
    location_type: data.home_location.location_type
  } : null;
  if (home) (home.location_type === 'structure' ? structureIds : stationIds).push(home.location_id);

  const jumpClones = (data.jump_clones || []).map(jc => {
    if (jc.location_id) (jc.location_type === 'structure' ? structureIds : stationIds).push(jc.location_id);
    if (jc.implants) universeNames.queueResolution(jc.implants, priority);
    return { location_id: jc.location_id, location_type: jc.location_type, implant: jc.implants || [] };
  });

  universeNames.queueResolution(stationIds, priority);
  structureNames.resolve(structureIds); // Scope-gated shared resolver

  cache[account.characterId] = {
    home_location: home, jump_clones: jumpClones,
    last_clone_jump_date: data.last_clone_jump_date,
    last_station_change_date: data.last_station_change_date,
    fetchedAt: Date.now()
  };
  saveCache();
  require('../snapshots').broadcastSnapshot(account.characterId);
  logger.info('CLONES-DATA', `Updated clones for ${account.characterName}`, { id: account.characterId, jump_clones: jumpClones.length });
  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('CLONES-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc, priority));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
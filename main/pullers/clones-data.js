// main/pullers/clones-data.js
// VERSION: 1.0
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const universeNames = require('./universe-names');

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

  // Collect all location IDs to resolve (Home station + Jump clone locations)
  const idsToResolve = [];
  if (data.home_location) idsToResolve.push(data.home_location.location_id);
  if (data.jump_clones) {
    for (const clone of data.jump_clones) {
      if (clone.location_id) idsToResolve.push(clone.location_id);
    }
  }

  // Queue name resolution right behind this pull
  universeNames.queueResolution(idsToResolve, priority);

  cache[account.characterId] = {
    home_location: data.home_location,
    jump_clones: data.jump_clones || [],
    last_clone_jump_date: data.last_clone_jump_date,
    last_station_change_date: data.last_station_change_date,
    fetchedAt: Date.now()
  };
  saveCache();
  logger.info('CLONES-DATA', `Updated clones for ${account.characterName}`, { id: account.characterId, jump_clones: cache[account.characterId].jump_clones.length });
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
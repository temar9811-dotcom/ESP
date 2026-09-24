// main/pullers/char-data.js
// VERSION: 1.6
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const staticDb = require('../esi/static-db');
const universeNames = require('./universe-names'); // Updated import

const CACHE_FILE = 'char-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('CHAR-DATA', 'Save failed', { error: e.message }); }
}

async function pullCharacter(account, priority) {
  loadCache();
  await staticDb.initDb();

  const baseUrl = 'https://esi.evetech.net/latest';
  const charUrl = `${baseUrl}/characters/${account.characterId}/`;
  const locUrl = `${baseUrl}/characters/${account.characterId}/location/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try { return await fetcher.request(url, token); } 
    catch (err) {
      if (err.status === 401) {
        logger.warn('CHAR-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const charRes = await makeRequest(charUrl);
  const locRes = await makeRequest(locUrl);

  const systemName = locRes.data.solar_system_id ? (staticDb.getSystemName(locRes.data.solar_system_id) || `System ${locRes.data.solar_system_id}`) : null;

  const data = {
    name: charRes.data.name,
    corporation_id: charRes.data.corporation_id,
    alliance_id: charRes.data.alliance_id,
    location: locRes.data,
    system_name: systemName,
    fetchedAt: Date.now()
  };

  cache[account.characterId] = data;
  saveCache();
  
  const idsToResolve = [data.corporation_id, data.alliance_id].filter(Boolean);
  universeNames.queueResolution(idsToResolve, priority); // Updated call
  require('../snapshots').broadcastSnapshot(account.characterId);

  logger.info('CHAR-DATA', `Updated ${data.name}`, { id: account.characterId, system: systemName });
  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('CHAR-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc, priority));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
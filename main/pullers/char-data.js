// main/pullers/char-data.js
// VERSION: 1.2
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');

const CACHE_FILE = 'char-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { cache = {}; }
}

function saveCache() {
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    fs.writeFileSync(p, JSON.stringify(cache, null, 2));
  } catch (e) { logger.error('CHAR-DATA', 'Save cache failed', { error: e.message }); }
}

async function pullCharacter(account) {
  loadCache();
  const baseUrl = 'https://esi.evetech.net/latest';
  const charUrl = `${baseUrl}/characters/${account.characterId}/`;
  const locUrl = `${baseUrl}/characters/${account.characterId}/location/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try {
      return await fetcher.request(url, token);
    } catch (err) {
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

  const data = {
    name: charRes.data.name,
    corporation_id: charRes.data.corporation_id,
    alliance_id: charRes.data.alliance_id,
    location: locRes.data,
    fetchedAt: Date.now()
  };
  
  cache[account.characterId] = data;
  saveCache();
  logger.info('CHAR-DATA', `Updated ${data.name}`, { id: account.characterId });
  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('CHAR-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
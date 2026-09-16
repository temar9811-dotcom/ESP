// main/pullers/wallet-data.js | Version: 1.2
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const staticDb = require('../esi/static-db'); // Use local DB instead of ESI

const CACHE_FILE = 'wallet-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('WALLET-DATA', 'Save failed', { error: e.message }); }
}

async function pullCharacter(account, priority) {
  loadCache();
  await staticDb.initDb(); // Ensure local DB is loaded

  const baseUrl = 'https://esi.evetech.net/latest';
  const balUrl = `${baseUrl}/characters/${account.characterId}/wallet/`;
  const jourUrl = `${baseUrl}/characters/${account.characterId}/wallet/journal/?datasource=tranquility`;
  const transUrl = `${baseUrl}/characters/${account.characterId}/wallet/transactions/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try { return await fetcher.request(url, token); } 
    catch (err) {
      if (err.status === 401) {
        logger.warn('WALLET-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const balRes = await makeRequest(balUrl);
  const jourRes = await makeRequest(jourUrl);
  const transRes = await makeRequest(transUrl);

  // Enrich transactions with names from the local Static DB
  const enrichedTrans = transRes.data.map(t => ({
    ...t,
    type_name: staticDb.getTypeName(t.type_id) || `Type ${t.type_id}`
  }));

  const data = {
    balance: balRes.data,
    journal: jourRes.data,
    transactions: enrichedTrans,
    fetchedAt: Date.now()
  };
  
  cache[account.characterId] = data;
  saveCache();
  logger.info('WALLET-DATA', `Updated wallet for ${account.characterName}`, { id: account.characterId, balance: data.balance });
  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('WALLET-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc, priority));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
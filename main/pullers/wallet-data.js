// main/pullers/wallet-data.js | Version: 1.3
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

function formatRefType(ref) {
  return String(ref || '').split('_').map((p) => (!p ? '' : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

function detectNewEntries(prev, journal, transactions) {
  const seenJ = new Set((prev?.journal || []).map((e) => Number(e.id)));
  const seenT = new Set((prev?.transactions || []).map((e) => Number(e.transaction_id)));
  const entries = [];

  for (const j of journal || []) {
    if (seenJ.has(Number(j.id))) continue;
    entries.push({
      kind: 'journal',
      amount: Number(j.amount || 0),
      description: j.description || formatRefType(j.ref_type) || 'Wallet entry',
      date: j.date
    });
  }
  for (const t of transactions || []) {
    if (seenT.has(Number(t.transaction_id))) continue;
    const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);
    const amount = t.is_buy ? -gross : gross;
    entries.push({
      kind: 'transaction',
      amount,
      description: `${t.is_buy ? 'Bought' : 'Sold'} ${t.quantity || 0} × ${t.type_name || `Type ${t.type_id}`}`,
      date: t.date
    });
  }

  return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
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

  // Notify only for entries new since the previous pull. The first-ever pull
  // for a character establishes the baseline silently, so adding a character
  // with a long wallet history doesn't spam notifications.
  const prev = cache[account.characterId] || null;
  const newEntries = prev ? detectNewEntries(prev, jourRes.data, enrichedTrans) : [];
  if (newEntries.length) {
    logger.info('WALLET-DATA', `New wallet activity for ${account.characterName}: ${newEntries.length} entries`);
    accounts.emitWalletActivity({
      characterId: account.characterId,
      characterName: account.characterName || 'Unknown',
      entries: newEntries
    });
  }

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
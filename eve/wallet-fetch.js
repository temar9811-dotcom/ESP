// File: eve/wallet-fetch.js | Version: 1.1
'use strict';
const config = require('./config');
const { esiFetch } = require('./http');
const logger = require('../main/debug/logger');
const log = (msg, data) => logger.debug('WALLET-FETCH', msg, data);

async function fetchPaged(url, accessToken, cutoffMs, maxPages, idField) {
  let fromId = null;
  const all = [];
  for (let page = 0; page < maxPages; page += 1) {
    const query = fromId ? `?from_id=${encodeURIComponent(fromId)}` : '';
    log(`page:${page + 1}:${url}`);
    const batch = await esiFetch(`${url}${query}`, accessToken);
    const entries = Array.isArray(batch) ? batch : [];
    if (!entries.length) { log(`page:${page + 1}:empty`); break; }
    entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const withinCutoff = entries.filter((entry) => new Date(entry.date).getTime() >= cutoffMs);
    all.push(...withinCutoff);
    const oldest = entries[entries.length - 1];
    if (!oldest || oldest[idField] == null) break;
    if (new Date(oldest.date).getTime() < cutoffMs) break;
    fromId = oldest[idField];
  }
  log(`done:${url}:count=${all.length}`);
  return all;
}

async function fetchWalletJournal(characterId, accessToken, cutoffMs, maxPages) {
  const safeMaxPages = Number.isFinite(maxPages) ? maxPages : config.WALLET.journalMaxPages;
  log(`journal:${characterId}:maxPages=${safeMaxPages}`);
  return fetchPaged(`/characters/${characterId}/wallet/journal/`, accessToken, cutoffMs, safeMaxPages, 'id');
}

async function fetchWalletTransactions(characterId, accessToken, cutoffMs, maxPages) {
  const safeMaxPages = Number.isFinite(maxPages) ? maxPages : config.WALLET.transactionMaxPages;
  log(`transactions:${characterId}:maxPages=${safeMaxPages}`);
  return fetchPaged(`/characters/${characterId}/wallet/transactions/`, accessToken, cutoffMs, safeMaxPages, 'transaction_id');
}

module.exports = { fetchWalletJournal, fetchWalletTransactions };
// File: eve/wallet.js | Version: 1.2
'use strict';
const config = require('./config');
const { esiFetch, publicFetch, publicPost } = require('./http');
const { fetchWalletJournal, fetchWalletTransactions } = require('./wallet-fetch');
const logger = require('../main/debug/logger');
const log = (msg, data) => logger.debug('WALLET', msg, data);
const isRateLimit = (err) => Boolean(err && (err.status === 420 || err.status === 429 || err.statusCode === 420 || err.statusCode === 429));

function formatRefType(ref) {
  return String(ref || '').split('_').map((p) => (!p ? '' : p.charAt(0).toUpperCase() + p.slice(1))).join(' ');
}

async function resolveNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();
  if (!unique.length) return map;

  log(`resolveNames:${unique.length}`);
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    try {
      const arr = await publicPost('/universe/names/', chunk);
      if (Array.isArray(arr)) {
        for (const item of arr) map.set(item.id, item.name);
      }
    } catch (err) {
      if (isRateLimit(err)) throw err;
    }
  }

  log(`resolveNames:resolved=${map.size}`);
  return map;
}

async function resolveTypeNames(ids, names) {
  const missing = [...new Set(ids.filter((id) => id && !names.has(id)))];
  log(`resolveTypeNames:${missing.length}`);

  await Promise.all(
    missing.map(async (id) => {
      try {
        const data = await publicFetch(`/universe/types/${id}/`);
        if (data && data.name) names.set(id, data.name);
      } catch (err) {
        if (isRateLimit(err)) throw err;
      }
    })
  );

  return names;
}

async function getWalletDetails(characterId, accessToken, days) {
  const safeDays = Number.isFinite(days) && days > 0 ? days : config.WALLET.defaultDetailDays;
  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  log(`getWalletDetails:${characterId}:days=${safeDays}`);
  const [journal, transactions] = await Promise.all([
    fetchWalletJournal(characterId, accessToken, cutoffMs),
    fetchWalletTransactions(characterId, accessToken, cutoffMs)
  ]);

  log(`getWalletDetails:${characterId}:journal=${journal.length}:transactions=${transactions.length}`);
  const ids = new Set();
  for (const j of journal) {
    if (j.first_party_id) ids.add(j.first_party_id);
    if (j.second_party_id) ids.add(j.second_party_id);
    if (j.context_id) ids.add(j.context_id);
    if (j.tax_receiver_id) ids.add(j.tax_receiver_id);
  }
  for (const t of transactions) {
    if (t.client_id) ids.add(t.client_id);
    if (t.type_id) ids.add(t.type_id);
  }

  const names = await resolveNames([...ids]);
  await resolveTypeNames(transactions.map((t) => t.type_id), names);

  const journalEntries = journal.map((j) => ({ kind: 'journal', id: j.id, date: j.date, amount: Number(j.amount || 0), balance: typeof j.balance === 'number' ? j.balance : null, category: formatRefType(j.ref_type), party: names.get(j.second_party_id) || names.get(j.first_party_id) || names.get(j.context_id) || '', description: j.description || j.reason || formatRefType(j.ref_type) }));

  const transactionEntries = transactions.map((t) => {
    const typeName = names.get(t.type_id) || `Type ${t.type_id}`;
    const clientName = names.get(t.client_id) || `Character ${t.client_id}`;
    const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);
    const amount = t.is_buy ? -gross : gross;
    return { kind: 'transaction', id: t.transaction_id, date: t.date, amount, balance: null, category: t.is_buy ? 'Buy' : 'Sell', party: clientName, description: `${t.is_buy ? 'Bought' : 'Sold'} ${t.quantity} × ${typeName}`, quantity: Number(t.quantity || 0), unitPrice: Number(t.unit_price || 0), type: typeName, isBuy: Boolean(t.is_buy) };
  });

  const entries = [...journalEntries, ...transactionEntries].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  let moneyIn = 0;
  let moneyOut = 0;
  for (const entry of entries) {
    const amount = Number(entry.amount || 0);
    if (amount >= 0) moneyIn += amount;
    else moneyOut += Math.abs(amount);
  }

  log(`getWalletDetails:${characterId}:entries=${entries.length}:in=${moneyIn}:out=${moneyOut}`);
  return {
    entries,
    summary: { count: entries.length, moneyIn, moneyOut, net: moneyIn - moneyOut },
    fetchedAt: new Date().toISOString()
  };
}

async function getRecentWalletEntries(characterId, accessToken) {
  log(`getRecentWalletEntries:${characterId}`);
  const [journal, transactions] = await Promise.all([
    esiFetch(`/characters/${characterId}/wallet/journal/`, accessToken),
    esiFetch(`/characters/${characterId}/wallet/transactions/`, accessToken)
  ]);

  return {
    journal: Array.isArray(journal) ? journal : [],
    transactions: Array.isArray(transactions) ? transactions : []
  };
}

module.exports = { getWalletDetails, getRecentWalletEntries, resolveNames, resolveTypeNames, formatRefType };
'use strict';

const config = require('./config');
const { esiFetch, publicPost } = require('./http');

function formatRefType(ref) {
  return String(ref || '')
    .split('_')
    .map((part) =>
      !part ? '' : part.charAt(0).toUpperCase() + part.slice(1)
    )
    .join(' ');
}

async function fetchWalletJournal(characterId, accessToken, cutoffMs, maxPages) {
  const safeMaxPages = Number.isFinite(maxPages)
    ? maxPages
    : config.WALLET.journalMaxPages;

  let fromId = null;
  const all = [];

  for (let page = 0; page < safeMaxPages; page += 1) {
    const query = fromId ? `?from_id=${encodeURIComponent(fromId)}` : '';
    const batch = await esiFetch(
      `/characters/${characterId}/wallet/journal/${query}`,
      accessToken
    );

    const entries = Array.isArray(batch) ? batch : [];
    if (!entries.length) break;

    entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const withinCutoff = entries.filter(
      (entry) => new Date(entry.date).getTime() >= cutoffMs
    );

    all.push(...withinCutoff);

    const oldest = entries[entries.length - 1];
    if (!oldest || oldest.id == null) break;

    const oldestTime = new Date(oldest.date).getTime();
    if (oldestTime < cutoffMs) break;

    fromId = oldest.id;
  }

  return all;
}

async function fetchWalletTransactions(
  characterId,
  accessToken,
  cutoffMs,
  maxPages
) {
  const safeMaxPages = Number.isFinite(maxPages)
    ? maxPages
    : config.WALLET.transactionMaxPages;

  let fromId = null;
  const all = [];

  for (let page = 0; page < safeMaxPages; page += 1) {
    const query = fromId ? `?from_id=${encodeURIComponent(fromId)}` : '';
    const batch = await esiFetch(
      `/characters/${characterId}/wallet/transactions/${query}`,
      accessToken
    );

    const entries = Array.isArray(batch) ? batch : [];
    if (!entries.length) break;

    entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );

    const withinCutoff = entries.filter(
      (entry) => new Date(entry.date).getTime() >= cutoffMs
    );

    all.push(...withinCutoff);

    const oldest = entries[entries.length - 1];
    if (!oldest || oldest.transaction_id == null) break;

    const oldestTime = new Date(oldest.date).getTime();
    if (oldestTime < cutoffMs) break;

    fromId = oldest.transaction_id;
  }

  return all;
}

async function resolveNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map();

  if (!unique.length) return map;

  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);

    try {
      const arr = await publicPost('/universe/names/', chunk);

      if (Array.isArray(arr)) {
        for (const item of arr) {
          map.set(item.id, item.name);
        }
      }
    } catch {
      // Ignore chunk resolution failures.
    }
  }

  return map;
}
async function getWalletDetails(characterId, accessToken, days) {
  const safeDays =
    Number.isFinite(days) && days > 0
      ? days
      : config.WALLET.defaultDetailDays;

  const cutoffMs = Date.now() - safeDays * 24 * 60 * 60 * 1000;

  const [journal, transactions] = await Promise.all([
    fetchWalletJournal(characterId, accessToken, cutoffMs),
    fetchWalletTransactions(characterId, accessToken, cutoffMs)
  ]);

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

  const journalEntries = journal.map((j) => {
    const amount = Number(j.amount || 0);

    return {
      kind: 'journal',
      id: j.id,
      date: j.date,
      amount,
      balance: typeof j.balance === 'number' ? j.balance : null,
      category: formatRefType(j.ref_type),
      party:
        names.get(j.second_party_id) ||
        names.get(j.first_party_id) ||
        names.get(j.context_id) ||
        '',
      description: j.description || j.reason || formatRefType(j.ref_type)
    };
  });

  const transactionEntries = transactions.map((t) => {
    const typeName = names.get(t.type_id) || `Type ${t.type_id}`;
    const clientName = names.get(t.client_id) || `Character ${t.client_id}`;
    const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);
    const amount = t.is_buy ? -gross : gross;

    return {
      kind: 'transaction',
      id: t.transaction_id,
      date: t.date,
      amount,
      balance: null,
      category: t.is_buy ? 'Buy' : 'Sell',
      party: clientName,
      description: `${t.is_buy ? 'Bought' : 'Sold'} ${t.quantity} × ${typeName}`,
      quantity: Number(t.quantity || 0),
      unitPrice: Number(t.unit_price || 0),
      type: typeName,
      isBuy: Boolean(t.is_buy)
    };
  });

  const entries = [...journalEntries, ...transactionEntries].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  let moneyIn = 0;
  let moneyOut = 0;

  for (const entry of entries) {
    const amount = Number(entry.amount || 0);

    if (amount >= 0) {
      moneyIn += amount;
    } else {
      moneyOut += Math.abs(amount);
    }
  }

  return {
    entries,
    summary: {
      count: entries.length,
      moneyIn,
      moneyOut,
      net: moneyIn - moneyOut
    },
    fetchedAt: new Date().toISOString()
  };
}

async function getRecentWalletEntries(characterId, accessToken) {
  const [journal, transactions] = await Promise.all([
    esiFetch(`/characters/${characterId}/wallet/journal/`, accessToken),
    esiFetch(`/characters/${characterId}/wallet/transactions/`, accessToken)
  ]);

  return {
    journal: Array.isArray(journal) ? journal : [],
    transactions: Array.isArray(transactions) ? transactions : []
  };
}

module.exports = {
  getWalletDetails,
  getRecentWalletEntries,
  resolveNames,
  formatRefType
};
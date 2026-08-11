'use strict';

const eve = require('../eve');
const eveConfig = require('../eve/config');
const accounts = require('./accounts');

let walletBaseline = new Map();
let checkInProgress = false;
let timer = null;

let callbacks = {
  onWalletActivity: () => {}
};

function init(newCallbacks) {
  callbacks = {
    ...callbacks,
    ...(newCallbacks || {})
  };
}

function removeBaseline(characterId) {
  walletBaseline.delete(Number(characterId));
}

function stop() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

function start(intervalMs) {
  stop();

  const safeInterval = Number.isFinite(intervalMs)
    ? intervalMs
    : eveConfig.WALLET_MONITOR?.intervalMs ?? 120000;

  timer = setInterval(() => {
    checkWalletActivity().catch(() => {
      // Ignore background monitor errors.
    });
  }, safeInterval);

  if (typeof timer.unref === 'function') {
    timer.unref();
  }
}

async function checkWalletActivity() {
  if (checkInProgress) {
    return;
  }

  checkInProgress = true;

  try {
    const list = accounts.getAccounts();

    for (const account of list) {
      try {
        const token = await accounts.getValidAccessToken(account, false);
        const recent = await eve.getRecentWalletEntries(
          account.characterId,
          token
        );

        const raw = [];

        for (const j of recent.journal) {
          raw.push({
            kind: 'journal',
            id: j.id,
            date: j.date,
            amount: Number(j.amount || 0),
            description: j.description || j.reason || 'Journal entry'
          });
        }

        for (const t of recent.transactions) {
          const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);

          raw.push({
            kind: 'transaction',
            id: t.transaction_id,
            date: t.date,
            amount: t.is_buy ? -gross : gross,
            typeId: t.type_id,
            quantity: Number(t.quantity || 0),
            isBuy: Boolean(t.is_buy)
          });
        }

        raw.sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        const key = Number(account.characterId);
        const currentIds = new Set(raw.map((entry) => `${entry.kind}-${entry.id}`));

        if (!walletBaseline.has(key)) {
          walletBaseline.set(key, currentIds);
          continue;
        }

        const baseline = walletBaseline.get(key);
        const fresh = raw.filter(
          (entry) => !baseline.has(`${entry.kind}-${entry.id}`)
        );

        walletBaseline.set(key, currentIds);

        if (!fresh.length) {
          continue;
        }

        const typeIds = [
          ...new Set(
            fresh
              .filter((entry) => entry.kind === 'transaction')
              .map((entry) => entry.typeId)
              .filter(Boolean)
          )
        ];

        let names = new Map();

        if (typeIds.length) {
          try {
            names = await eve.getTypeNames(typeIds);
          } catch {
            names = new Map();
          }
        }

        const friendly = fresh.map((entry) => {
          if (entry.kind === 'transaction') {
            const typeName = names.get(entry.typeId) || `Type ${entry.typeId}`;

            return {
              description: `${entry.isBuy ? 'Bought' : 'Sold'} ${entry.quantity} × ${typeName}`,
              amount: entry.amount
            };
          }

          return {
            description: entry.description,
            amount: entry.amount
          };
        });

        callbacks.onWalletActivity({
          characterName: account.characterName || 'Unknown',
          entries: friendly
        });
      } catch {
        // Ignore per-character wallet check errors.
      }
    }
  } finally {
    checkInProgress = false;
  }
}

module.exports = {
  init,
  start,
  stop,
  checkWalletActivity,
  removeBaseline
};
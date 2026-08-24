'use strict';

const accounts = require('./accounts');
const assets = require('./assets');
const { publicFetch } = require('../eve/http');

const CYCLE_DELAY_MS = 2 * 60 * 60 * 1000; // full sweep every 2 hours
const BETWEEN_CHARS_MS = 2500;            // breathing room between characters

let running = false;
let currentCharacterId = null;
let lastCycleStartedAt = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getState() {
  return { running, currentCharacterId, lastCycleStartedAt };
}

function scopesOf(account) {
  if (typeof account.scopes === 'string') {
    return account.scopes.split(' ').filter(Boolean);
  }
  return Array.isArray(account.scopes) ? account.scopes : null;
}

async function processCharacter(account) {
  currentCharacterId = account.characterId;

  const scopes = scopesOf(account);

  const personalSkipped =
    scopes !== null && !scopes.includes('esi-assets.read_assets.v1');
  const corpSkipped =
    account.corpAssetsDenied === true ||
    (scopes !== null && !scopes.includes('esi-assets.read_corporation_assets.v1'));
  const canReadStructures =
    scopes !== null && scopes.includes('esi-universe.read_structures.v1');

  if (personalSkipped) account.hasAssetAccess = false;
  if (corpSkipped) account.hasCorpAccess = false;

  // Nothing to try this cycle — no ESI calls at all
  if (personalSkipped && corpSkipped) return;

  let token = null;

  // --- Personal assets ---
  if (!personalSkipped) {
    try {
      token = await accounts.getValidAccessToken(account, false);

      let raw;
      try {
        raw = await assets.getCharacterAssets(account.characterId, token);
      } catch (err) {
        if (err && err.status === 401) {
          token = await accounts.getValidAccessToken(account, true);
          raw = await assets.getCharacterAssets(account.characterId, token);
        } else if (err && err.status === 403) {
          // No asset scope on this token — mark and never retry until re-add
          account.scopes = '';
          account.hasAssetAccess = false;
          raw = null;
        } else {
          throw err;
        }
      }

      if (raw) {
        const tree = await assets.buildAssetTree(
          raw,
          token,
          canReadStructures
        );
        const fetchedAt = new Date().toISOString();

        assets.savePersonalCache(account.characterId, { fetchedAt, tree });
        account.assetLastFetch = fetchedAt;
        account.assetCount = raw.length;
        account.hasAssetAccess = true;
        account.assetLastError = null;
      }
    } catch (err) {
      if (err && (err.status === 420 || err.status === 429)) {
        throw err; // handled by the cycle loop below
      }
      account.assetLastError = err?.message || String(err);
      console.error(
        '[assets]',
        account.characterName || account.characterId,
        err?.status ?? '',
        err?.message || String(err)
      );
    }
  }

  // --- Corp assets (director only, tried once per character) ---
  if (!corpSkipped) {
    try {
      if (!token) {
        token = await accounts.getValidAccessToken(account, false);
      }

      if (!account.corporationId) {
        const charInfo = await publicFetch(
          `/characters/${account.characterId}/`
        );
        if (charInfo && charInfo.corporation_id) {
          account.corporationId = charInfo.corporation_id;
        }
      }

      if (account.corporationId) {
        const corpRaw = await assets.getCorpAssets(
          account.corporationId,
          token
        );
        const corpTree = await assets.buildAssetTree(
          corpRaw,
          token,
          canReadStructures
        );
        const corpFetchedAt = new Date().toISOString();

        assets.saveCorpCache(account.corporationId, {
          fetchedAt: corpFetchedAt,
          tree: corpTree
        });
        account.corpAssetLastFetch = corpFetchedAt;
        account.corpAssetCount = corpRaw.length;
        account.hasCorpAccess = true;
      }
    } catch (err) {
      if (err && err.status === 403) {
        account.hasCorpAccess = false;
        account.corpAssetsDenied = true; // no retries next cycle
      } else if (err && (err.status === 420 || err.status === 429)) {
        throw err;
      } else {
        console.warn(
          '[assets] corp fetch failed for',
          account.characterName,
          err?.message || String(err)
        );
      }
    }
  }
}

async function runCycle() {
  const list = accounts.getAccounts();

  for (const account of list) {
    if (!running) break;

    await accounts.waitRateLimit();

    try {
      await processCharacter(account);
    } catch (err) {
      if (err && (err.status === 420 || err.status === 429)) {
        accounts.enterRateLimit(Number(err.resetSeconds) || 60);
        await accounts.waitRateLimit();
      } else {
        throw err;
      }
    }

    accounts.broadcastAccounts();

    await sleep(BETWEEN_CHARS_MS);
  }
}

async function loop() {
  if (running) return;
  running = true;

  while (running) {
    lastCycleStartedAt = new Date().toISOString();
    await runCycle();
    if (running) await sleep(CYCLE_DELAY_MS);
  }
}

function start() {
  loop();
}

function stop() {
  running = false;
}

// Manual "Refresh now" — clears the corp-denied flag so it retries once
async function refreshCharacterAssets(characterId) {
  const account = accounts
    .getAccounts()
    .find((a) => Number(a.characterId) === Number(characterId));

  if (!account) throw new Error('Character not found.');

  account.corpAssetsDenied = false;

  await accounts.waitRateLimit();
  await processCharacter(account);
  accounts.broadcastAccounts();

  return {
    assetLastFetch: account.assetLastFetch || null,
    corpAssetLastFetch: account.corpAssetLastFetch || null,
    hasCorpAccess: Boolean(account.hasCorpAccess)
  };
}

module.exports = {
  start,
  stop,
  getState,
  refreshCharacterAssets
};
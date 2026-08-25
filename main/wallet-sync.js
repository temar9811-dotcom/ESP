'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const accounts = require('./accounts');
const sequencer = require('./esi-sequencer');
const debug = require('./debug');
const eve = require('../eve');
const eveConfig = require('../eve/config');

// The wallet section is the second sequenced ESI section — it runs after
// skills and re-pulls every 10 minutes. Journal entries and transactions
// for every character are cached here; the renderer reads the cache.
const SECTION = 'wallet';
const DETAIL_DAYS = 7;

let cache = null;
let pulling = false;
let started = false;
let timer = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheFile() {
  return path.join(app.getPath('userData'), 'wallet-cache.json');
}

function loadCache() {
  if (cache) return cache;

  try {
    cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {};
  } catch {
    cache = {};
  }

  if (!cache || typeof cache !== 'object') {
    cache = {};
  }

  if (!cache.characters || typeof cache.characters !== 'object') {
    cache.characters = {};
  }

  return cache;
}

function saveCache() {
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(loadCache()), 'utf8');
  } catch {
    // Ignore cache write errors.
  }
}

function isPulling() {
  return pulling;
}

// Cached wallet details for the renderer, or null when absent.
function getDetails(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !entry.data) return null;

  return {
    data: entry.data,
    fetchedAt: entry.fetchedAt || null,
    pulling: isPulling()
  };
}

function store(characterId, data) {
  loadCache().characters[String(characterId)] = {
    data,
    fetchedAt: new Date().toISOString()
  };
}

function removeCharacter(characterId) {
  if (cache && cache.characters) {
    delete cache.characters[String(characterId)];
    saveCache();
  }
}

async function fetchOne(account, token) {
  try {
    return await eve.getWalletDetails(account.characterId, token, DETAIL_DAYS);
  } catch (err) {
    if (err && err.status === 401) {
      const fresh = await accounts.getValidAccessToken(account, true);
      return eve.getWalletDetails(account.characterId, fresh, DETAIL_DAYS);
    }
    throw err;
  }
}

async function pull() {
  if (pulling) {
    debug.log(SECTION, 'pull requested while one is already running — skipped');
    return { skipped: true };
  }

  pulling = true;
  debug.log(SECTION, 'pull starting — acquiring the ESI sequencer');
  await sequencer.acquire(SECTION);

  const errors = {};
  let pulled = 0;

  try {
    const list = accounts.getAccounts();
    debug.log(SECTION, `pulling journal + transactions for ${list.length} character(s)`);

    // Resolve tokens up front; SSO refreshes are not ESI calls.
    const tasks = [];
    for (const account of list) {
      try {
        const token = await accounts.getValidAccessToken(account, false);
        tasks.push({ account, token });
      } catch (err) {
        errors[account.characterId] = err?.message || String(err);
        debug.log(
          SECTION,
          `token refresh failed for ${account.characterName || account.characterId}: ${err?.message || err}`
        );
      }
    }

    const batchSize = Math.max(1, Number(eveConfig.WALLET_SYNC?.batchSize) || 10);
    const batchDelay = Math.max(0, Number(eveConfig.WALLET_SYNC?.batchDelayMs) || 0);
    const batchCount = Math.ceil(tasks.length / batchSize);

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batchNumber = i / batchSize + 1;

      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();

      const batch = tasks.slice(i, i + batchSize);
      debug.log(
        SECTION,
        `ESI GET /characters/*/wallet/(journal+transactions) batch ${batchNumber}/${batchCount} (${batch.length} call(s))`
      );

      const results = await Promise.allSettled(
        batch.map(({ account, token }) => fetchOne(account, token))
      );

      results.forEach((result, index) => {
        const { account } = batch[index];
        const name = account.characterName || account.characterId;

        if (result.status === 'fulfilled') {
          store(account.characterId, result.value);
          pulled += 1;
          debug.log(
            SECTION,
            `${name}: ${result.value?.summary?.count ?? 0} entries in the last ${DETAIL_DAYS} days`
          );
        } else {
          const err = result.reason;
          errors[account.characterId] = err?.message || String(err);
          debug.log(
            SECTION,
            `${name}: pull failed (status ${err?.status ?? 'n/a'}) — ${err?.message || err}`
          );
          if (err && err.status === 420) {
            accounts.enterRateLimit(Number(err.resetSeconds) || 60);
            debug.log(
              SECTION,
              `ESI 420 — entering rate-limit cooldown for ${Number(err.resetSeconds) || 60}s`
            );
          }
        }
      });

      if (i + batchSize < tasks.length) {
        debug.log(SECTION, `pausing ${batchDelay}ms before the next batch`);
        await sleep(batchDelay);
      }
    }

    saveCache();
    debug.log(SECTION, `cache saved (${pulled} pulled, ${Object.keys(errors).length} failed)`);
    accounts.broadcastAccounts();
  } finally {
    sequencer.release(SECTION);
    pulling = false;
  }

  debug.log(SECTION, `pull finished — ${pulled} pulled, ${Object.keys(errors).length} failed`);
  return { pulled, errors };
}

function start() {
  if (started) return;
  started = true;

  debug.log(SECTION, 'startup wallet pull scheduled');

  pull().catch((err) =>
    console.error('[wallet] startup pull failed', err?.message || err)
  );

  const interval = Math.max(60000, Number(eveConfig.WALLET_SYNC?.intervalMs) || 600000);
  timer = setInterval(() => {
    debug.log(SECTION, 'scheduled pull timer fired');
    pull().catch((err) =>
      console.error('[wallet] scheduled pull failed', err?.message || err)
    );
  }, interval);
  if (timer.unref) timer.unref();
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

module.exports = {
  start,
  stop,
  pull,
  isPulling,
  getDetails,
  removeCharacter
};

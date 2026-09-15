// File: main/wallet-sync.js | Version: 1.1
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const accounts = require('./accounts');
const sequencer = require('./esi-sequencer');
const debugLogger = require('./debug-logger');
const eve = require('../eve');
const eveConfig = require('../eve/config');

const SECTION = 'wallet';
const DETAIL_DAYS = 7;
let cache = null;
let pulling = false;
let started = false;
let timer = null;
let lastPullAt = null;
let nextPullAt = null;

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
  debugLogger.debug('WALLET', `Cache loaded: ${Object.keys(cache.characters).length} characters`);
  return cache;
}

function saveCache() {
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(loadCache()), 'utf8');
    debugLogger.debug('WALLET', 'Cache saved');
  } catch (err) {
    debugLogger.error('WALLET', 'Cache save failed', { error: err.message });
  }
}

function isPulling() {
  return pulling;
}

function getDetails(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !entry.data) {
    debugLogger.debug('WALLET', `No cached wallet details for character ${characterId}`);
    return null;
  }
  debugLogger.debug('WALLET', `Returning cached wallet details for ${characterId}: ${entry.data?.entries?.length || 0} entries`);
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
  debugLogger.debug('WALLET', `Stored wallet data for character ${characterId}: ${data?.entries?.length || 0} entries`);
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
    debugLogger.debug('WALLET', 'Pull requested while one is already running — skipped');
    return { skipped: true };
  }
  pulling = true;
  lastPullAt = Date.now();
  debugLogger.info('WALLET', 'Pull starting — acquiring the ESI sequencer');
  await sequencer.acquire(SECTION);
  const errors = {};
  let pulled = 0;
  try {
    const list = accounts.getAccounts();
    debugLogger.info('WALLET', `Pulling journal + transactions for ${list.length} character(s)`);
    const tasks = [];
    for (const account of list) {
      try {
        const token = await accounts.getValidAccessToken(account, false);
        tasks.push({ account, token });
      } catch (err) {
        errors[account.characterId] = err?.message || String(err);
        debugLogger.error('WALLET', `Token refresh failed for ${account.characterName || account.characterId}`, { error: err?.message });
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
      debugLogger.info('WALLET', `ESI GET /characters/*/wallet/(journal+transactions) batch ${batchNumber}/${batchCount} (${batch.length} call(s))`);
      const results = await Promise.allSettled(
        batch.map(({ account, token }) => fetchOne(account, token))
      );
      results.forEach((result, index) => {
        const { account } = batch[index];
        const name = account.characterName || account.characterId;
        if (result.status === 'fulfilled') {
          store(account.characterId, result.value);
          pulled += 1;
          debugLogger.info('WALLET', `${name}: ${result.value?.summary?.count ?? 0} entries in the last ${DETAIL_DAYS} days`);
        } else {
          const err = result.reason;
          errors[account.characterId] = err?.message || String(err);
          debugLogger.error('WALLET', `${name}: pull failed`, { status: err?.status, error: err?.message });
          if (err && err.status === 420) {
            accounts.enterRateLimit(Number(err.resetSeconds) || 60);
            debugLogger.warn('WALLET', `ESI 420 — entering rate-limit cooldown for ${Number(err.resetSeconds) || 60}s`);
          }
        }
      });
      if (i + batchSize < tasks.length) {
        debugLogger.debug('WALLET', `Pausing ${batchDelay}ms before the next batch`);
        await sleep(batchDelay);
      }
    }
    saveCache();
    debugLogger.info('WALLET', `Cache saved (${pulled} pulled, ${Object.keys(errors).length} failed)`);
    accounts.broadcastAccounts();
  } finally {
    sequencer.release(SECTION);
    pulling = false;
  }
  debugLogger.info('WALLET', `Pull finished — ${pulled} pulled, ${Object.keys(errors).length} failed`);
  return { pulled, errors };
}

function start() {
  if (started) return;
  started = true;
  debugLogger.info('WALLET', 'Startup wallet pull scheduled');
  pull().catch((err) => debugLogger.error('WALLET', 'Startup pull failed', { error: err?.message }));
  const interval = Math.max(60000, Number(eveConfig.WALLET_SYNC?.intervalMs) || 600000);
  nextPullAt = Date.now() + interval;
  timer = setInterval(() => {
    debugLogger.debug('WALLET', 'Scheduled pull timer fired');
    nextPullAt = Date.now() + interval;
    pull().catch((err) => debugLogger.error('WALLET', 'Scheduled pull failed', { error: err?.message }));
  }, interval);
  if (timer.unref) timer.unref();
}

function getSyncState() {
  return {
    pulling,
    lastPullAt,
    nextPullAt,
    intervalMs: Math.max(60000, Number(eveConfig.WALLET_SYNC?.intervalMs) || 600000)
  };
}

function resetCache() {
  cache = null;
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
  getSyncState,
  resetCache,
  getDetails,
  removeCharacter
};
// File: main/assets-names.js | Version: 2.0
'use strict';
const accounts = require('./accounts');
const sequencer = require('./esi-sequencer');
const logger = require('./debug-logger');
const eveConfig = require('../eve/config');
const cache = require('./assets-names-cache');
const { resolveCharacter } = require('./assets-names-resolve');

const SECTION = 'ASSETS-NAMES';
let started = false;
let timer = null;
let lastPullAt = null;
let nextPullAt = null;

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function pull() {
  if (cache.isPulling()) { logger.debug(SECTION, 'pull skipped — already running'); return { skipped: true }; }
  cache.setPulling(true);
  lastPullAt = Date.now();
  logger.debug(SECTION, 'name resolution starting — acquiring sequencer');
  await sequencer.acquire(SECTION);
  const errors = {};
  let resolved = 0;
  try {
    const list = accounts.getAccounts();
    logger.debug(SECTION, `resolving names for ${list.length} character(s)`);
    const batchSize = Math.max(1, Number(eveConfig.ASSETS_NAMES?.batchSize) || 5);
    const batchDelay = Math.max(0, Number(eveConfig.ASSETS_NAMES?.batchDelayMs) || 0);
    for (let i = 0; i < list.length; i += batchSize) {
      const batch = list.slice(i, i + batchSize);
      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();
      for (const account of batch) {
        const name = account.characterName || account.characterId;
        try {
          const token = await accounts.getValidAccessToken(account, false);
          let result;
          try { result = await resolveCharacter(account, token); }
          catch (err) {
            if (err && err.status === 401) { const fresh = await accounts.getValidAccessToken(account, true); result = await resolveCharacter(account, fresh); }
            else throw err;
          }
          if (result) { cache.store(account.characterId, result); resolved += 1; logger.debug(SECTION, `${name}: resolved ${Object.keys(result.locations).length} location(s)`); }
        } catch (err) {
          errors[account.characterId] = err?.message || String(err);
          logger.error(SECTION, `${name}: resolution failed`, { status: err?.status, error: err?.message || String(err) });
          if (err && err.status === 420) accounts.enterRateLimit(Number(err.resetSeconds) || 60);
        }
      }
      if (i + batchSize < list.length) await sleep(batchDelay);
    }
    cache.saveCache();
    logger.debug(SECTION, `cache saved`, { resolved, failed: Object.keys(errors).length });
  } finally { sequencer.release(SECTION); cache.setPulling(false); }
  logger.debug(SECTION, `resolution finished`, { resolved, failed: Object.keys(errors).length });
  return { resolved, errors };
}

function start() {
  if (started) return;
  started = true;
  logger.debug(SECTION, 'startup name resolution scheduled');
  pull().catch((err) => logger.error(SECTION, 'startup resolution failed', { error: err?.message || String(err) }));
  const interval = Math.max(60000, Number(eveConfig.ASSETS_NAMES?.intervalMs) || 24 * 60 * 60 * 1000);
  nextPullAt = Date.now() + interval;
  timer = setInterval(() => {
    logger.debug(SECTION, 'scheduled resolution timer fired');
    nextPullAt = Date.now() + interval;
    pull().catch((err) => logger.error(SECTION, 'scheduled resolution failed', { error: err?.message || String(err) }));
  }, interval);
  if (timer.unref) timer.unref();
}

function getSyncState() {
  return { pulling: cache.isPulling(), lastPullAt, nextPullAt, intervalMs: Math.max(60000, Number(eveConfig.ASSETS_NAMES?.intervalMs) || 24 * 60 * 60 * 1000) };
}

function stop() { if (timer) clearInterval(timer); timer = null; started = false; }

module.exports = { start, stop, pull, isPulling: cache.isPulling, getSyncState, resetCache: cache.resetCache, getNames: cache.getNames, removeCharacter: cache.removeCharacter };
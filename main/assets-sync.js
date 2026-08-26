'use strict';

const { app } = require('electron');
const fs = require('fs');
const path = require('path');

const accounts = require('./accounts');
const sequencer = require('./esi-sequencer');
const debug = require('./debug');
const assets = require('./assets');
const eveConfig = require('../eve/config');

// The assets section is the third sequenced ESI section — it runs after
// skills and wallet and re-pulls every 45 minutes. Raw personal asset
// rows for every character are cached here; name/structure resolution is
// NOT part of this pull (the assets tab resolves lazily).
const SECTION = 'assets';

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
  return path.join(app.getPath('userData'), 'assets-raw-cache.json');
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

  if (!cache.corporations || typeof cache.corporations !== 'object') {
    cache.corporations = {};
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

// Cached raw assets for the renderer, or null when absent.
function getRaw(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !entry.assets) return null;

  return {
    assets: entry.assets,
    fetchedAt: entry.fetchedAt || null,
    pulling: isPulling()
  };
}

function store(characterId, rows) {
  loadCache().characters[String(characterId)] = {
    assets: rows,
    fetchedAt: new Date().toISOString()
  };
}

// Cached raw corporation assets (shared across the corp's members), or null.
function getCorpRaw(corpId) {
  const entry = loadCache().corporations[String(corpId)];
  if (!entry || !entry.assets) return null;

  return {
    assets: entry.assets,
    fetchedAt: entry.fetchedAt || null,
    pulling: isPulling()
  };
}

function storeCorp(corpId, rows) {
  loadCache().corporations[String(corpId)] = {
    assets: rows,
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
    return await assets.getCharacterAssets(account.characterId, token);
  } catch (err) {
    if (err && err.status === 401) {
      const fresh = await accounts.getValidAccessToken(account, true);
      return assets.getCharacterAssets(account.characterId, fresh);
    }
    throw err;
  }
}

async function fetchCorp(corpId, token, account) {
  try {
    return await assets.getCorpAssets(corpId, token);
  } catch (err) {
    if (err && err.status === 401) {
      const fresh = await accounts.getValidAccessToken(account, true);
      return assets.getCorpAssets(corpId, fresh);
    }
    throw err;
  }
}

async function pull(onlyCharacterId) {
  if (pulling) {
    debug.log(SECTION, 'pull requested while one is already running — skipped');
    return { skipped: true };
  }

  pulling = true;
  lastPullAt = Date.now();
  debug.log(SECTION, 'pull starting — acquiring the ESI sequencer');
  await sequencer.acquire(SECTION);

  const errors = {};
  let pulled = 0;

  try {
    let list = accounts.getAccounts();
    if (onlyCharacterId != null) {
      list = list.filter((a) => Number(a.characterId) === Number(onlyCharacterId));
    }
    debug.log(SECTION, `pulling assets for ${list.length} character(s)`);

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

    const batchSize = Math.max(1, Number(eveConfig.ASSETS_SYNC?.batchSize) || 10);
    const batchDelay = Math.max(0, Number(eveConfig.ASSETS_SYNC?.batchDelayMs) || 0);

    // Personal asset pulls.
    const batchCount = Math.ceil(tasks.length / batchSize);

    for (let i = 0; i < tasks.length; i += batchSize) {
      const batchNumber = i / batchSize + 1;

      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();

      const batch = tasks.slice(i, i + batchSize);
      debug.log(
        SECTION,
        `ESI GET /characters/*/assets batch ${batchNumber}/${batchCount} (${batch.length} call(s))`
      );

      const results = await Promise.allSettled(
        batch.map(({ account, token }) => fetchOne(account, token))
      );

      results.forEach((result, index) => {
        const { account } = batch[index];
        const name = account.characterName || account.characterId;

        if (result.status === 'fulfilled') {
          store(account.characterId, result.value);
          account.assetLastFetch = new Date().toISOString();
          account.assetCount = Array.isArray(result.value) ? result.value.length : 0;
          pulled += 1;
          debug.log(
            SECTION,
            `${name}: ${account.assetCount} asset rows`
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

    // Corp asset pulls — one per distinct corp. Character pulls orphan ~92%
    // of rows to parents that are corp-owned (shared across members, which
    // is why the same missing id appears for several characters). The corp
    // map lets walkToTop continue through those parents to the real
    // station/structure the corp asset sits in. Characters without the
    // Director/hangar role are skipped gracefully (ESI 403s them anyway).
    const corpTasks = [];
    const seenCorps = new Set();
    for (const { account, token } of tasks) {
      let corpId = account.corporationId || null;
      if (!corpId) {
        try {
          const info = await assets.getCharacterInfoPublic(account.characterId);
          if (info && info.corporation_id != null) {
            corpId = Number(info.corporation_id);
            account.corporationId = corpId;
          }
        } catch {
          corpId = null;
        }
      }
      if (!corpId) continue;
      const key = String(corpId);
      if (seenCorps.has(key)) continue;
      // Gate by corp role so scope-only characters don't burn 403s.
      const allowed = await assets.canAccessCorpAssets(account.characterId, token);
      if (!allowed) {
        debug.log(
          SECTION,
          `${account.characterName || account.characterId}: no corp asset access (missing Director/hangar role) — skipping corp pull`
        );
        continue;
      }
      seenCorps.add(key);
      corpTasks.push({ corpId: Number(corpId), token, account });
    }

    let corpPulled = 0;
    for (const { corpId, token, account } of corpTasks) {
      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();
      try {
        const rows = await fetchCorp(corpId, token, account);
        storeCorp(corpId, rows);
        account.corpAssetLastFetch = new Date().toISOString();
        account.corpAssetCount = Array.isArray(rows) ? rows.length : 0;
        corpPulled += 1;
        debug.log(
          SECTION,
          `corp ${corpId}: ${account.corpAssetCount} corp asset rows`
        );
      } catch (err) {
        errors[`corp-${corpId}`] = err?.message || String(err);
        debug.log(
          SECTION,
          `corp ${corpId}: pull failed (status ${err?.status ?? 'n/a'}) — ${err?.message || err}`
        );
      }
    }
    if (corpPulled) {
      debug.log(SECTION, `pulled raw assets for ${corpPulled} corporation(s)`);
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

  debug.log(SECTION, 'startup asset pull scheduled');

  pull().catch((err) =>
    console.error('[assets] startup pull failed', err?.message || err)
  );

  const interval = Math.max(60000, Number(eveConfig.ASSETS_SYNC?.intervalMs) || 45 * 60 * 1000);
  nextPullAt = Date.now() + interval;
  timer = setInterval(() => {
    debug.log(SECTION, 'scheduled pull timer fired');
    nextPullAt = Date.now() + interval;
    pull().catch((err) =>
      console.error('[assets] scheduled pull failed', err?.message || err)
    );
  }, interval);
  if (timer.unref) timer.unref();
}

function getSyncState() {
  return {
    pulling,
    lastPullAt,
    nextPullAt,
    intervalMs: Math.max(60000, Number(eveConfig.ASSETS_SYNC?.intervalMs) || 45 * 60 * 1000)
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
  getRaw,
  getCorpRaw,
  storeCorp,
  removeCharacter
};

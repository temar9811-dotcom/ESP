// File: main/ipc-assets.js | Version: 1.3
'use strict';
const { ipcMain } = require('electron');
const accounts = require('./accounts');
const assets = require('./assets');
const assetsSync = require('./assets-sync');
const assetsNames = require('./assets-names');
const assetsQueue = require('./assets-queue');
const logger = require('./debug-logger');
const log = (msg, data) => logger.debug('ASSETS-IPC', msg, data);

function findAccount(characterId) {
  return accounts.getAccounts().find((a) => Number(a.characterId) === Number(characterId));
}

function countAssets(payload) {
  if (!payload) return 0;
  return Array.isArray(payload) ? payload.length : (payload.assets?.length || 0);
}

function personalPayload(characterId) {
  const cached = assets.getPersonalCache?.(characterId) || null;
  const cachedCount = countAssets(cached);

  if (cachedCount > 0) {
    log(`getPersonal:${characterId}:cache`, { count: cachedCount });
    return cached;
  }

  const raw = assetsSync.getRaw?.(characterId) || null;
  const rawCount = countAssets(raw);

  log(`getPersonal:${characterId}:fallback`, { cachedCount, rawCount });
  return rawCount > 0 ? raw : cached;
}

function corpPayload(corpId) {
  const cached = assets.getCorpCache?.(corpId) || null;
  const cachedCount = countAssets(cached);

  if (cachedCount > 0) {
    log(`getCorp:${corpId}:cache`, { count: cachedCount });
    return cached;
  }

  const raw = assetsSync.getCorpRaw?.(corpId) || null;
  const rawCount = countAssets(raw);

  log(`getCorp:${corpId}:fallback`, { cachedCount, rawCount });
  return rawCount > 0 ? raw : cached;
}

function registerAssetsIpc() {
  ipcMain.handle('assets:getPersonal', (_event, characterId) => personalPayload(characterId));

  ipcMain.handle('assets:getCorp', (_event, characterId) => {
    const account = findAccount(characterId);
    if (!account || !account.corporationId) {
      log(`getCorp:${characterId}:no-corp`);
      return null;
    }
    return corpPayload(account.corporationId);
  });

  ipcMain.handle('assets:refreshNow', async (_event, characterId) => {
    log(`refreshNow:${characterId}`);
    try {
      const result = await assetsSync.pull(characterId);
      log(`refreshNow done:${characterId}`, { ok: true });
      return result;
    } catch (err) {
      logger.error('ASSETS-IPC', `refreshNow failed:${characterId}`, {
        error: err?.message || String(err),
        status: err?.status
      });
      throw err;
    }
  });

  ipcMain.handle('assets:getRaw', (_event, characterId) => {
    const raw = assetsSync.getRaw?.(characterId) || null;
    log(`getRaw:${characterId}`, { count: countAssets(raw) });
    return raw;
  });

  ipcMain.handle('assets:getCorpRaw', (_event, characterId) => {
    const account = findAccount(characterId);
    if (!account || !account.corporationId) {
      log(`getCorpRaw:${characterId}:no-corp`);
      return null;
    }
    const raw = assetsSync.getCorpRaw?.(account.corporationId) || null;
    log(`getCorpRaw:${account.corporationId}`, { count: countAssets(raw) });
    return raw;
  });

  ipcMain.handle('assets:getNames', (_event, characterId) => {
    const result = assetsNames.getNames(characterId);
    log(`getNames:${characterId}`, {
      hasNames: Boolean(result),
      locations: result?.locations ? Object.keys(result.locations).length : 0,
      pulling: result?.pulling
    });
    return result;
  });

  ipcMain.handle('assets:queueRefresh', async (_event, characterId) => {
    log(`queueRefresh:${characterId}`);
    try {
      const result = await assetsSync.pull(characterId);
      log(`queueRefresh done:${characterId}`, { ok: true });
      return result;
    } catch (err) {
      logger.error('ASSETS-IPC', `queueRefresh failed:${characterId}`, {
        error: err?.message || String(err),
        status: err?.status
      });
      throw err;
    }
  });

  ipcMain.handle('assets:getQueueState', () => {
    log('getQueueState');
    return assetsQueue.getState();
  });
}

module.exports = { registerAssetsIpc };
// File Version: 1.1.15-beta
'use strict';
const { ipcMain } = require('electron');
const accounts = require('./accounts');
const assets = require('./assets');
const assetsSync = require('./assets-sync');
const assetsNames = require('./assets-names');
const assetsQueue = require('./assets-queue');

function registerAssetsIpc() {
  ipcMain.handle('assets:getPersonal', (_event, characterId) => {
    return assets.getPersonalCache(characterId);
  });
  ipcMain.handle('assets:getCorp', (_event, characterId) => {
    const account = accounts.getAccounts().find(
      (a) => Number(a.characterId) === Number(characterId)
    );
    if (!account || !account.corporationId) return null;
    return assets.getCorpCache(account.corporationId);
  });
  ipcMain.handle('assets:refreshNow', async (_event, characterId) => {
    return assetsSync.pull(characterId);
  });
  ipcMain.handle('assets:getRaw', (_event, characterId) => {
    return assetsSync.getRaw(characterId);
  });
  ipcMain.handle('assets:getCorpRaw', (_event, characterId) => {
    const account = accounts.getAccounts().find(
      (a) => Number(a.characterId) === Number(characterId)
    );
    if (!account || !account.corporationId) return null;
    return assetsSync.getCorpRaw(account.corporationId);
  });
  ipcMain.handle('assets:getNames', (_event, characterId) => {
    return assetsNames.getNames(characterId);
  });
  ipcMain.handle('assets:queueRefresh', async (_event, characterId) => {
    return assetsSync.pull(characterId);
  });
  ipcMain.handle('assets:getQueueState', () => {
    return assetsQueue.getState();
  });
}

module.exports = { registerAssetsIpc };
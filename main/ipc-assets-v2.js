// File: main/ipc-assets-v2.js | Version: 1.0
'use strict';
const { ipcMain } = require('electron');
const logger = require('./debug/logger');
const assetsData = require('./pullers/assets-data');
const universeNames = require('./pullers/universe-names');

function registerAssetsV2Ipc() {
  ipcMain.handle('assets-v2:getTree', (_event, characterId) => {
    const cache = assetsData.getCache();
    const charData = cache[characterId];
    if (!charData) {
      logger.debug('ASSETS-V2', `No data for ${characterId}`);
      return null;
    }
    const typeNames = universeNames.getCache();
    logger.debug('ASSETS-V2', `Returning tree for ${characterId}`, {
      hasTree: Boolean(charData.tree),
      unresolvedCount: charData.unresolved?.length || 0,
      assetCount: charData.assets?.length || 0
    });
    return {
      tree: charData.tree || null,
      unresolved: charData.unresolved || [],
      typeNames,
      lastUpdated: charData.lastUpdated
    };
  });
}

module.exports = { registerAssetsV2Ipc };
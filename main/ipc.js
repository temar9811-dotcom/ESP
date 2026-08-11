'use strict';

const { ipcMain } = require('electron');

const { VERSION } = require('../version');
const eve = require('../eve');
const accounts = require('./accounts');
const plans = require('./plans');
const settings = require('./settings');
const importer = require('./importer');

let testHarness = null;

function setTestHarness(harness) {
  testHarness = harness;
}

function registerIpcHandlers() {
  ipcMain.handle('app:getVersion', () => {
    return VERSION;
  });

  ipcMain.handle('accounts:list', () => {
    return accounts.getPublicAccounts();
  });

  ipcMain.handle('accounts:add', async () => {
    return accounts.addAccount();
  });

  ipcMain.handle('accounts:remove', async (_event, characterId) => {
    accounts.removeAccount(characterId);
    return accounts.getPublicAccounts();
  });

  ipcMain.handle('accounts:refresh', async () => {
    await accounts.refreshAll();
    return accounts.getPublicAccounts();
  });

  ipcMain.handle('accounts:getWalletDetails', async (_event, characterId) => {
    const account = accounts.getAccounts().find(
      (a) => Number(a.characterId) === Number(characterId)
    );

    if (!account) {
      throw new Error('Character not found.');
    }

    try {
      let token = await accounts.getValidAccessToken(account, false);

      try {
        return await eve.getWalletDetails(account.characterId, token, 7);
      } catch (err) {
        if (err && err.status === 401) {
          token = await accounts.getValidAccessToken(account, true);
          return await eve.getWalletDetails(account.characterId, token, 7);
        }
        throw err;
      }
    } catch (err) {
      throw new Error(err?.message || String(err));
    }
  });

  ipcMain.handle('plans:readClipboard', async () => {
    return plans.readClipboardPlan();
  });

  ipcMain.handle('plans:list', () => {
    return plans.loadPlans();
  });

  ipcMain.handle('plans:save', async (_event, payload) => {
    return plans.savePlan(payload);
  });

  ipcMain.handle('plans:delete', async (_event, planId) => {
    return plans.deletePlan(planId);
  });

  ipcMain.handle('settings:get', () => {
    return settings.getSettings();
  });

  ipcMain.handle('settings:set', (_event, patch) => {
    return settings.setSettings(patch);
  });

  ipcMain.handle('import:legacy', async () => {
    const current = settings.getSettings();

    if (!current.importEnabled) {
      return { ok: false, error: 'Import is disabled in settings.' };
    }

    const summary = importer.importLegacy();

    if (summary.ok) {
      accounts.broadcastAccounts();
    }

    return summary;
  });

  ipcMain.handle('test:run', async (_event, command, payload) => {
    if (!testHarness) {
      return { ok: false, error: 'Test harness not installed.' };
    }
    return testHarness.run(command, payload);
  });

  ipcMain.handle('test:enabled', () => {
    return testHarness ? testHarness.testEnabled() : false;
  });
}

module.exports = {
  registerIpcHandlers,
  setTestHarness
};
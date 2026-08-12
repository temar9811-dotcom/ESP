'use strict';

const { ipcMain, app } = require('electron');

const { VERSION } = require('../version');
const eve = require('../eve');
const accounts = require('./accounts');
const plans = require('./plans');
const settings = require('./settings');
const importer = require('./importer');
const toastWindow = require('./toast-window');
const corpInfo = require('./corp-info');
const groups = require('./groups');
const skillMeta = require('./skill-meta');

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

  ipcMain.handle('accounts:getCorpInfo', async (_event, characterId) => {
    return corpInfo.getCorpAlliance(characterId);
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

  ipcMain.handle('groups:get', () => {
    return groups.getGroups();
  });

  ipcMain.handle('groups:set', (_event, characterId, name) => {
    return groups.setGroup(characterId, name);
  });

  ipcMain.handle('groups:setPrimary', (_event, characterId) => {
    return groups.setPrimary(characterId);
  });

  ipcMain.handle('groups:toggle', (_event, groupName) => {
    return groups.toggleCollapsed(groupName);
  });

  ipcMain.handle('skills:getMeta', async (_event, ids) => {
    return skillMeta.getMetaForIds(ids);
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
    const updated = settings.setSettings(patch);

    if (patch && typeof patch.openAtLogin === 'boolean') {
      app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
    }

    return updated;
  });

  ipcMain.handle('import:legacy', async () => {
    const current = settings.getSettings();

    if (!current.importEnabled) {
      return { ok: false, error: 'Import is disabled in settings.' };
    }

    const summary = await importer.importLegacy();

    if (summary.ok) {
      accounts.broadcastAccounts();
    }

    return summary;
  });

  ipcMain.handle('toast:show', (_event, title, body) => {
    toastWindow.showToast(title, body);
    return true;
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
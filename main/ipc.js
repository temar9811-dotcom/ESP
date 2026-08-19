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
const notes = require('./notes');
const clonesHistory = require('./clones-history');

let testHarness = null;

function setTestHarness(harness) {
  testHarness = harness;
}

async function inferFirstRunActiveClone(characterId, token, jumpClones, clonesData) {
  let currentLocationId = null;

  try {
    const location = await eve.esiFetch(
      `/characters/${characterId}/location/`,
      token
    );
    currentLocationId = location?.solar_system_id || location?.station_id || null;
  } catch {
    return { jumpCloneId: null, name: 'Unknown', implants: [], totalValue: 0, confidence: 'unknown' };
  }

  if (!currentLocationId) {
    return { jumpCloneId: null, name: 'In space — active clone unknown', implants: [], totalValue: 0, confidence: 'unknown' };
  }

  const homeLocationId = clonesData.home_location?.location_id || null;
  const standbysAtLocation = jumpClones.filter((jc) => jc.locationId === currentLocationId);

  if (standbysAtLocation.length === 0) {
    if (homeLocationId && currentLocationId === homeLocationId) {
      return { jumpCloneId: null, name: 'Home clone', implants: [], totalValue: 0, confidence: 'likely' };
    }
    return { jumpCloneId: null, name: 'Occupying clone at this location', implants: [], totalValue: 0, confidence: 'likely' };
  }

  return { jumpCloneId: null, name: 'Active body at this location', implants: [], totalValue: 0, confidence: 'likely' };
}

async function fetchCloneDetails(account, token) {
  const id = account.characterId;

  const scopes = Array.isArray(account.scopes) ? account.scopes : [];
  const hasClonesScope = scopes.includes('esi-clones.read_clones.v1');

  if (!hasClonesScope) {
    return {
      homeLocation: null,
      jumpClones: [],
      lastCloneJumpDate: null,
      activeClone: null,
      fetchedAt: new Date().toISOString()
    };
  }

  const clonesData = await eve.getClones(id, token);

  const previousSnapshot = clonesHistory.getSnapshot(id);
  const detection = eve.inferActiveClone(clonesData, previousSnapshot);
  clonesHistory.setSnapshot(id, clonesData);

  const priceMap = await eve.getMarketPrices();

  const locationIds = (clonesData.jump_clones || []).map((jc) => jc.location_id);

  if (clonesData.home_location && clonesData.home_location.location_id) {
    locationIds.push(clonesData.home_location.location_id);
  }

  const locationNames = new Map();

  for (const locId of locationIds) {
    const locationObj = { structure_id: locId, station_id: locId };

    try {
      const name = await eve.resolveLocationName(locationObj, token);
      if (name) locationNames.set(locId, name);
    } catch { /* skip */ }
  }

  const allImplantTypeIds = new Set();

  for (const jc of clonesData.jump_clones || []) {
    for (const tid of jc.implants || []) allImplantTypeIds.add(tid);
  }

  let implantNames = new Map();

  if (allImplantTypeIds.size > 0) {
    try {
      implantNames = await eve.getTypeNames([...allImplantTypeIds]);
    } catch { /* ignore */ }
  }

  const jumpClones = [];

  for (const jc of clonesData.jump_clones || []) {
    const implants = [];
    let totalValue = 0;

    for (const typeId of jc.implants || []) {
      const slot = await eve.getImplantSlot(typeId);
      const price = (priceMap.get(typeId) || {}).averagePrice || 0;

      implants.push({
        typeId,
        name: implantNames.get(typeId) || `Implant ${typeId}`,
        slot,
        price
      });

      totalValue += price;
    }

    implants.sort((a, b) => (a.slot || 99) - (b.slot || 99));

    jumpClones.push({
      name: jc.name || null,
      locationId: jc.location_id,
      locationName: locationNames.get(jc.location_id) || null,
      jumpCloneId: jc.jump_clone_id,
      implants,
      totalValue
    });
  }

  let activeClone = null;

  if (detection.status === 'occupied') {
    const jc = detection.clone;
    const implants = [];
    let totalValue = 0;

    for (const typeId of jc.implants || []) {
      const slot = await eve.getImplantSlot(typeId);
      const price = (priceMap.get(typeId) || {}).averagePrice || 0;

      implants.push({
        typeId,
        name: implantNames.get(typeId) || `Implant ${typeId}`,
        slot,
        price
      });

      totalValue += price;
    }

    implants.sort((a, b) => (a.slot || 99) - (b.slot || 99));

    activeClone = {
      jumpCloneId: jc.jump_clone_id,
      name: jc.name || null,
      implants,
      totalValue,
      confidence: detection.confidence
    };
  } else if (detection.status === 'first_run') {
    activeClone = await inferFirstRunActiveClone(id, token, jumpClones, clonesData);
  }

  let homeLocation = null;

  if (clonesData.home_location && clonesData.home_location.location_id) {
    homeLocation = {
      locationId: clonesData.home_location.location_id,
      locationName: locationNames.get(clonesData.home_location.location_id) || null
    };
  }

  return {
    homeLocation,
    jumpClones,
    lastCloneJumpDate: clonesData.last_clone_jump_date || null,
    activeClone,
    fetchedAt: new Date().toISOString()
  };
}

function registerIpcHandlers() {
  ipcMain.handle('app:getVersion', () => {
    return VERSION;
  });

  ipcMain.handle('app:getRefreshState', () => {
    return accounts.getRefreshState();
  });

  ipcMain.handle('accounts:list', () => {
    return accounts.getPublicAccounts();
  });

  ipcMain.handle('accounts:add', async (_event, scopeChoice) => {
    return accounts.addAccount(scopeChoice);
  });

  ipcMain.handle('accounts:cancelLogin', () => {
    accounts.cancelLogin();
    return true;
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

  ipcMain.handle('accounts:getCloneDetails', async (_event, characterId) => {
    const account = accounts.getAccounts().find(
      (a) => Number(a.characterId) === Number(characterId)
    );

    if (!account) {
      throw new Error('Character not found.');
    }

    try {
      let token = await accounts.getValidAccessToken(account, false);

      try {
        return await fetchCloneDetails(account, token);
      } catch (err) {
        if (err && err.status === 401) {
          token = await accounts.getValidAccessToken(account, true);
          return await fetchCloneDetails(account, token);
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

  ipcMain.handle('skills:resolveNames', async (_event, ids) => {
    const map = await skillMeta.resolveNames(ids);
    return Object.fromEntries(map);
  });

    ipcMain.handle('notes:get', (_event, characterId) => {
    return notes.getNote(characterId);
  });

  ipcMain.handle('notes:set', (_event, characterId, text) => {
    const saved = notes.setNote(characterId, text);

    const account = accounts
      .getAccounts()
      .find((a) => Number(a.characterId) === Number(characterId));

    if (account) {
      account.notes = saved;
      accounts.broadcastAccounts();
    }

    return saved;
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
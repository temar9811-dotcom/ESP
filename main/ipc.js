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
const skillsSync = require('./skills-sync');
const walletSync = require('./wallet-sync');
const notes = require('./notes');
const clonesHistory = require('./clones-history');
const cloneNicknames = require('./clones-nicknames');
const assets = require('./assets');
const assetsQueue = require('./assets-queue');

let testHarness = null;

function setTestHarness(harness) {
  testHarness = harness;
}

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms);
    })
  ]).finally(() => clearTimeout(timer));
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
  const scopes = typeof account.scopes === 'string'
    ? account.scopes.split(' ')
    : Array.isArray(account.scopes) ? account.scopes : null;

  // If scopes were never stored (pre-v1.1.13 account), don't gate — try the fetch
  // and handle 403 gracefully. If scopes are stored, check for the clone scope.
  if (scopes !== null) {
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
  }

  let clonesData;
  try {
    clonesData = await withTimeout(eve.getClones(id, token), 10000);
  } catch (err) {
    if (err && err.status === 403) {
      account.scopes = '';
      return {
        homeLocation: null,
        jumpClones: [],
        lastCloneJumpDate: null,
        activeClone: null,
        fetchedAt: new Date().toISOString()
      };
    }
    throw err;
  }

  const previousSnapshot = clonesHistory.getSnapshot(id);
  const detection = eve.inferActiveClone(clonesData, previousSnapshot);
  clonesHistory.setSnapshot(id, clonesData);

  const priceMap = await withTimeout(eve.getMarketPrices(), 15000);

  const locationIds = (clonesData.jump_clones || []).map((jc) => jc.location_id);
  if (clonesData.home_location && clonesData.home_location.location_id) {
    locationIds.push(clonesData.home_location.location_id);
  }

  const locationNames = new Map();
  for (const locId of locationIds) {
    const locationObj = { structure_id: locId, station_id: locId };
    try {
      const name = await withTimeout(eve.resolveLocationName(locationObj, token), 10000);
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
      implantNames = await withTimeout(eve.getTypeNames([...allImplantTypeIds]), 10000);
    } catch { /* ignore */ }
  }

  const nicknames = cloneNicknames.getAllNicknames();
  const jumpClones = [];

  for (const jc of clonesData.jump_clones || []) {
    const implants = [];
    let totalValue = 0;

    for (const typeId of jc.implants || []) {
      const slot = await withTimeout(eve.getImplantSlot(typeId), 10000);
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

    const nickname = nicknames[String(jc.jump_clone_id)]?.name || null;

    jumpClones.push({
      name: nickname || jc.name || null,
      nickname: nickname || null,
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
      const slot = await withTimeout(eve.getImplantSlot(typeId), 10000);
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
    activeClone = await withTimeout(
      inferFirstRunActiveClone(id, token, jumpClones, clonesData),
      10000
    );
  }

  let homeLocation = null;
  if (clonesData.home_location && clonesData.home_location.location_id) {
    homeLocation = {
      locationId: clonesData.home_location.location_id,
      locationName: locationNames.get(clonesData.home_location.location_id) || null
    };
  }

  account.clones = {
    homeLocation,
    jumpClones,
    lastCloneJumpDate: clonesData.last_clone_jump_date || null,
    activeClone,
    fetchedAt: new Date().toISOString()
  };

  return account.clones;
}

function registerIpcHandlers() {
  ipcMain.handle('app:getVersion', () => {
    return VERSION;
  });

  ipcMain.handle('app:getRefreshState', () => {
    return accounts.getRefreshState();
  });

  // Per-section ESI sync state for the tabs-bar indicator: whether each
  // section is pulling and when its next scheduled pull fires.
  ipcMain.handle('app:getSyncState', () => {
    return {
      skills: skillsSync.getSyncState(),
      wallet: walletSync.getSyncState(),
      assets: { pulling: false, lastPullAt: null, nextPullAt: null, intervalMs: null }
    };
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

  // The Refresh button cycles the sequencer: it refreshes the dashboard
  // data and queues fresh skills + wallet pulls through the ESI
  // sequencer, then reports the sync state so the button can unlock.
  ipcMain.handle('accounts:refresh', async () => {
    await accounts.refreshAll();
    await Promise.allSettled([skillsSync.pull(), walletSync.pull()]);
    return {
      accounts: accounts.getPublicAccounts(),
      sync: {
        skills: skillsSync.getSyncState(),
        wallet: walletSync.getSyncState()
      }
    };
  });

  ipcMain.handle('accounts:getCorpInfo', async (_event, characterId) => {
    return corpInfo.getCorpAlliance(characterId);
  });

  // Wallet details come from the wallet-sync cache (sequenced ESI pull,
  // re-pulled every 10 minutes). A cache miss returns a placeholder and
  // queues a pull so the tab fills in on the next accounts broadcast.
  ipcMain.handle('wallet:getCharacter', async (_event, characterId) => {
    const account = accounts.getAccounts().find(
      (a) => Number(a.characterId) === Number(characterId)
    );
    if (!account) {
      throw new Error('Character not found.');
    }

    const cached = walletSync.getDetails(characterId);
    if (cached) return cached;

    walletSync.pull().catch((err) =>
      console.error('[wallet] on-demand pull failed', err?.message || err)
    );

    return { data: null, fetchedAt: null, pulling: walletSync.isPulling() };
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
        return await withTimeout(fetchCloneDetails(account, token), 30000);
      } catch (err) {
        if (err && err.status === 401) {
          token = await accounts.getValidAccessToken(account, true);
          return await withTimeout(fetchCloneDetails(account, token), 30000);
        }
        throw err;
      }
    } catch (err) {
      throw new Error(err?.message || String(err));
    }
  });

  ipcMain.handle('cloneNicknames:get', (_event, cloneId) => {
    return cloneNicknames.getNickname(cloneId);
  });

  ipcMain.handle('cloneNicknames:set', (_event, cloneId, name) => {
    return cloneNicknames.setNickname(cloneId, name);
  });

  ipcMain.handle('cloneNicknames:getAll', () => {
    return cloneNicknames.getAllNicknames();
  });

  // --- Assets (passive cache reads + manual refresh) ---
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
    return assetsQueue.refreshCharacterAssets(characterId);
  });

  ipcMain.handle('assets:getQueueState', () => {
    return assetsQueue.getState();
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

  ipcMain.handle('skills:getCharacter', async (_event, characterId) => {
    return skillsSync.getGroupedSkills(characterId);
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
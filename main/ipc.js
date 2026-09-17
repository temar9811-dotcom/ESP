// File: main/ipc.js | Version: 1.4
'use strict';
const { ipcMain, app } = require('electron');
const { VERSION } = require('../version');
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
const ipcClones = require('./ipc-clones');
const ipcAssets = require('./ipc-assets');
const ipcAssetsV2 = require('./ipc-assets-v2');
const ipcDebug = require('./ipc-debug');
const logger = require('./debug/logger');

let testHarness = null;
function setTestHarness(harness) { testHarness = harness; }

const handle = (channel, handler) => ipcMain.handle(channel, async (event, ...args) => {
  logger.debug('IPC', `-> ${channel}`, { args: args.length });
  try {
    const result = await handler(event, ...args);
    logger.debug('IPC', `<- ${channel}`, { ok: true });
    return result;
  } catch (err) {
    logger.error('IPC', `<- ${channel}`, { ok: false, error: err?.message || String(err) });
    throw err;
  }
});

function registerIpcHandlers() {
  handle('app:getVersion', () => VERSION);
  handle('app:getRefreshState', () => accounts.getRefreshState());
  handle('app:getSyncState', () => ({ skills: skillsSync.getSyncState(), wallet: walletSync.getSyncState(), assets: require('./assets-sync').getSyncState() }));
  handle('app:getSequencerState', () => { const seq = require('./esi-sequencer').getState(); return { ...seq, locked: Boolean(seq.holder) }; });
  handle('accounts:list', () => accounts.getPublicAccounts());
  handle('accounts:add', (_e, scopeChoice) => accounts.addAccount(scopeChoice));
  handle('accounts:cancelLogin', () => { accounts.cancelLogin(); return true; });
  handle('accounts:remove', (_e, id) => { accounts.removeAccount(id); return accounts.getPublicAccounts(); });
  handle('accounts:refresh', async () => { await accounts.refreshAll(); await Promise.allSettled([skillsSync.pull(), walletSync.pull()]); return { accounts: accounts.getPublicAccounts(), sync: { skills: skillsSync.getSyncState(), wallet: walletSync.getSyncState() } }; });
  handle('accounts:getCorpInfo', (_e, id) => corpInfo.getCorpAlliance(id));
  handle('accounts:addTestPilot', (_e, id, name) => { accounts.addTestPilot(id, name); return accounts.getPublicAccounts(); });
  handle('accounts:removeTestPilots', () => { accounts.removeTestPilots(); return accounts.getPublicAccounts(); });

  handle('wallet:getCharacter', async (_e, id) => {
    const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(id));
    if (!account) throw new Error('Character not found.');
    const cached = walletSync.getDetails(id);
    if (cached) return cached;
    walletSync.pull().catch((err) => logger.error('WALLET', 'on-demand pull failed', { error: err?.message || String(err) }));
    return { data: null, fetchedAt: null, pulling: walletSync.isPulling() };
  });

  handle('groups:get', () => groups.getGroups());
  handle('groups:set', (_e, id, name) => groups.setGroup(id, name));
  handle('groups:setPrimary', (_e, id) => groups.setPrimary(id));
  handle('groups:toggle', (_e, name) => groups.toggleCollapsed(name));
  handle('skills:getMeta', (_e, ids) => skillMeta.getMetaForIds(ids));
  handle('skills:getCharacter', (_e, id) => skillsSync.getGroupedSkills(id));
  handle('skills:resolveNames', async (_e, ids) => Object.fromEntries(await skillMeta.resolveNames(ids)));
  handle('notes:get', (_e, id) => notes.getNote(id));
  handle('notes:set', (_e, id, text) => { const saved = notes.setNote(id, text); const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(id)); if (account) { account.notes = saved; accounts.broadcastAccounts(); } return saved; });
  handle('plans:readClipboard', () => plans.readClipboardPlan());
  handle('plans:list', () => plans.loadPlans());
  handle('plans:save', (_e, payload) => plans.savePlan(payload));
  handle('plans:delete', (_e, planId) => plans.deletePlan(planId));
  handle('settings:get', () => settings.getSettings());
  handle('settings:set', (_e, patch) => { const updated = settings.setSettings(patch); if (patch && typeof patch.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: patch.openAtLogin }); return updated; });
  handle('import:legacy', async () => { const current = settings.getSettings(); if (!current.importEnabled) return { ok: false, error: 'Import is disabled in settings.' }; const summary = await importer.importLegacy(); if (summary.ok) accounts.broadcastAccounts(); return summary; });
  handle('toast:show', (_e, title, body) => { toastWindow.showToast(title, body); return true; });
  handle('test:run', (_e, command, payload) => (!testHarness ? { ok: false, error: 'Test harness not installed.' } : testHarness.run(command, payload)));
  handle('test:enabled', () => (testHarness ? testHarness.testEnabled() : false));

  const CACHE_FILES = { skills: 'skills-cache.json', wallet: 'wallet-cache.json', assets: 'assets-raw-cache.json', assetsNames: 'assets-names-cache.json', structures: 'structure-names.json', universe: 'universe-cache.json' };
  const clearCacheFile = (name) => { try { require('fs').unlinkSync(require('path').join(app.getPath('userData'), name)); return true; } catch { return false; } };
  const listAssetCacheFiles = () => { try { return require('fs').readdirSync(app.getPath('userData')).filter((f) => /^assets-\d+.json$/.test(f) || /^corp-assets-\d+.json$/.test(f)); } catch { return []; } };

  handle('cache:clear', (_e, which) => {
    if (which === 'all') {
      const files = [...Object.values(CACHE_FILES), ...listAssetCacheFiles()];
      const cleared = files.filter(clearCacheFile);
      [skillsSync, walletSync, require('./assets-sync'), require('./assets-names')].forEach((m) => { if (m.resetCache) m.resetCache(); });
      return { cleared };
    }
    if (which === 'assetsFiles') return { cleared: listAssetCacheFiles().filter(clearCacheFile) };
    const file = CACHE_FILES[which];
    if (!file) return { cleared: [], error: `Unknown cache: ${which}` };
    const cleared = clearCacheFile(file) ? [file] : [];
    if (which === 'skills' && skillsSync.resetCache) skillsSync.resetCache();
    if (which === 'wallet' && walletSync.resetCache) walletSync.resetCache();
    if (which === 'assets' && require('./assets-sync').resetCache) require('./assets-sync').resetCache();
    if (which === 'assetsNames' && require('./assets-names').resetCache) require('./assets-names').resetCache();
    return { cleared };
  });

  ipcClones.registerClonesIpc();
  ipcAssets.registerAssetsIpc();
  ipcAssetsV2.registerAssetsV2Ipc();
  ipcDebug.registerDebugIpc();
}

module.exports = { registerIpcHandlers, setTestHarness };
// FILE: ipc.js
// VERSION: 1.1.16-beta
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
let testHarness = null;
function setTestHarness(harness) { testHarness = harness; }
function registerIpcHandlers() {
ipcMain.handle('app:getVersion', () => VERSION);
ipcMain.handle('app:getRefreshState', () => accounts.getRefreshState());
ipcMain.handle('app:getSyncState', () => ({
skills: skillsSync.getSyncState(),
wallet: walletSync.getSyncState(),
assets: require('./assets-sync').getSyncState()
}));
ipcMain.handle('app:getSequencerState', () => {
const seq = require('./esi-sequencer').getState();
return { ...seq, locked: Boolean(seq.holder) };
});
ipcMain.handle('accounts:list', () => accounts.getPublicAccounts());
ipcMain.handle('accounts:add', async (_event, scopeChoice) => accounts.addAccount(scopeChoice));
ipcMain.handle('accounts:cancelLogin', () => { accounts.cancelLogin(); return true; });
ipcMain.handle('accounts:remove', async (_event, characterId) => {
accounts.removeAccount(characterId);
return accounts.getPublicAccounts();
});
ipcMain.handle('accounts:refresh', async () => {
await accounts.refreshAll();
await Promise.allSettled([skillsSync.pull(), walletSync.pull()]);
return {
accounts: accounts.getPublicAccounts(),
sync: { skills: skillsSync.getSyncState(), wallet: walletSync.getSyncState() }
};
});
ipcMain.handle('accounts:getCorpInfo', async (_event, characterId) => corpInfo.getCorpAlliance(characterId));
// Test pilot handlers
ipcMain.handle('accounts:addTestPilot', (_event, characterId, characterName) => {
accounts.addTestPilot(characterId, characterName);
return accounts.getPublicAccounts();
});
ipcMain.handle('accounts:removeTestPilots', () => {
accounts.removeTestPilots();
return accounts.getPublicAccounts();
});
ipcMain.handle('wallet:getCharacter', async (_event, characterId) => {
const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(characterId));
if (!account) throw new Error('Character not found.');
const cached = walletSync.getDetails(characterId);
if (cached) return cached;
walletSync.pull().catch((err) => console.error('[wallet] on-demand pull failed', err?.message || err));
return { data: null, fetchedAt: null, pulling: walletSync.isPulling() };
});
ipcMain.handle('groups:get', () => groups.getGroups());
ipcMain.handle('groups:set', (_event, characterId, name) => groups.setGroup(characterId, name));
ipcMain.handle('groups:setPrimary', (_event, characterId) => groups.setPrimary(characterId));
ipcMain.handle('groups:toggle', (_event, groupName) => groups.toggleCollapsed(groupName));
ipcMain.handle('skills:getMeta', async (_event, ids) => skillMeta.getMetaForIds(ids));
ipcMain.handle('skills:getCharacter', async (_event, characterId) => skillsSync.getGroupedSkills(characterId));
ipcMain.handle('skills:resolveNames', async (_event, ids) => Object.fromEntries(await skillMeta.resolveNames(ids)));
ipcMain.handle('notes:get', (_event, characterId) => notes.getNote(characterId));
ipcMain.handle('notes:set', (_event, characterId, text) => {
const saved = notes.setNote(characterId, text);
const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(characterId));
if (account) { account.notes = saved; accounts.broadcastAccounts(); }
return saved;
});
ipcMain.handle('plans:readClipboard', async () => plans.readClipboardPlan());
ipcMain.handle('plans:list', () => plans.loadPlans());
ipcMain.handle('plans:save', async (_event, payload) => plans.savePlan(payload));
ipcMain.handle('plans:delete', async (_event, planId) => plans.deletePlan(planId));
ipcMain.handle('settings:get', () => settings.getSettings());
ipcMain.handle('settings:set', (_event, patch) => {
const updated = settings.setSettings(patch);
if (patch && typeof patch.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: patch.openAtLogin });
return updated;
});
ipcMain.handle('import:legacy', async () => {
const current = settings.getSettings();
if (!current.importEnabled) return { ok: false, error: 'Import is disabled in settings.' };
const summary = await importer.importLegacy();
if (summary.ok) accounts.broadcastAccounts();
return summary;
});
ipcMain.handle('toast:show', (_event, title, body) => { toastWindow.showToast(title, body); return true; });
ipcMain.handle('test:run', async (_event, command, payload) => {
if (!testHarness) return { ok: false, error: 'Test harness not installed.' };
return testHarness.run(command, payload);
});
ipcMain.handle('test:enabled', () => testHarness ? testHarness.testEnabled() : false);
// Cache clearing
const CACHE_FILES = {
skills: 'skills-cache.json', wallet: 'wallet-cache.json', assets: 'assets-raw-cache.json',
assetsNames: 'assets-names-cache.json', structures: 'structure-names.json', universe: 'universe-cache.json'
};
function clearCacheFile(name) {
const fs = require('fs');
const path = require('path');
try { fs.unlinkSync(path.join(app.getPath('userData'), name)); return true; } catch { return false; }
}
function listAssetCacheFiles() {
const fs = require('fs');
const path = require('path');
try { return fs.readdirSync(app.getPath('userData')).filter((f) => /^assets-\d+.json$/.test(f) || /^corp-assets-\d+.json$/.test(f)); } catch { return []; }
}
ipcMain.handle('cache:clear', (_event, which) => {
if (which === 'all') {
const files = [...Object.values(CACHE_FILES), ...listAssetCacheFiles()];
const cleared = files.filter((f) => clearCacheFile(f));
if (skillsSync.resetCache) skillsSync.resetCache();
if (walletSync.resetCache) walletSync.resetCache();
if (require('./assets-sync').resetCache) require('./assets-sync').resetCache();
if (require('./assets-names').resetCache) require('./assets-names').resetCache();
return { cleared };
}
if (which === 'assetsFiles') {
return { cleared: listAssetCacheFiles().filter((f) => clearCacheFile(f)) };
}
const file = CACHE_FILES[which];
if (!file) return { cleared: [], error: `Unknown cache: ${which}` };
const cleared = clearCacheFile(file) ? [file] : [];
if (which === 'skills' && skillsSync.resetCache) skillsSync.resetCache();
if (which === 'wallet' && walletSync.resetCache) walletSync.resetCache();
if (which === 'assets' && require('./assets-sync').resetCache) require('./assets-sync').resetCache();
if (which === 'assetsNames' && require('./assets-names').resetCache) require('./assets-names').resetCache();
return { cleared };
});
// Delegate clone and asset handlers
ipcClones.registerClonesIpc();
ipcAssets.registerAssetsIpc();
}
module.exports = { registerIpcHandlers, setTestHarness };
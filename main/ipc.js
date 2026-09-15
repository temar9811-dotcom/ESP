// main/ipc.js
// VERSION: 1.7
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
const ipcDebug = require('./ipc-debug');
const scheduler = require('./scheduler');
const logger = require('./debug/logger');
let testHarness = null;
function setTestHarness(h) { testHarness = h; }
const handle = (ch, fn) => ipcMain.handle(ch, async (e, ...a) => {
  try { return await fn(e, ...a); }
  catch (err) { logger.error('IPC', `<- ${ch}`, { error: err?.message }); throw err; }
});
function registerIpcHandlers() {
  handle('app:getVersion', () => VERSION);
  handle('app:getRefreshState', () => accounts.getRefreshState());
  handle('app:getSyncState', () => ({ skills: skillsSync.getSyncState(), wallet: walletSync.getSyncState(), assets: require('./assets-sync').getSyncState() }));
  handle('app:getSequencerState', () => { const s = require('./esi-sequencer').getState(); return { ...s, locked: Boolean(s.holder) }; });
  handle('app:getCharData', (_e, id) => require('./pullers/char-data').getCache()[id] || null);
  handle('app:getWalletData', (_e, id) => require('./pullers/wallet-data').getCache()[id] || null);
  handle('app:getSkillsData', (_e, id) => require('./pullers/skills-data').getCache()[id] || null);
  handle('accounts:list', () => accounts.getPublicAccounts());
  handle('accounts:add', (_e, s) => accounts.addAccount(s));
  handle('accounts:cancelLogin', () => { accounts.cancelLogin(); return true; });
  handle('accounts:remove', (_e, id) => { accounts.removeAccount(id); return accounts.getPublicAccounts(); });
  handle('accounts:refresh', async () => { await accounts.refreshAll(); return { accounts: accounts.getPublicAccounts() }; });
  handle('accounts:getCorpInfo', (_e, id) => corpInfo.getCorpAlliance(id));
  handle('groups:get', () => groups.getGroups());
  handle('groups:set', (_e, id, n) => groups.setGroup(id, n));
  handle('groups:setPrimary', (_e, id) => groups.setPrimary(id));
  handle('groups:toggle', (_e, n) => groups.toggleCollapsed(n));
  handle('skills:getMeta', (_e, ids) => skillMeta.getMetaForIds(ids));
  handle('skills:getCharacter', (_e, id) => skillsSync.getGroupedSkills(id));
  handle('skills:resolveNames', async (_e, ids) => Object.fromEntries(await skillMeta.resolveNames(ids)));
  handle('notes:get', (_e, id) => notes.getNote(id));
  handle('notes:set', (_e, id, t) => { const s = notes.setNote(id, t); const a = accounts.getAccounts().find(a => Number(a.characterId) === Number(id)); if (a) { a.notes = s; accounts.broadcastAccounts(); } return s; });
  handle('plans:readClipboard', () => plans.readClipboardPlan());
  handle('plans:list', () => plans.loadPlans());
  handle('plans:save', (_e, p) => plans.savePlan(p));
  handle('plans:delete', (_e, id) => plans.deletePlan(id));
  handle('settings:get', () => settings.getSettings());
  handle('settings:set', (_e, p) => { const u = settings.setSettings(p); if (p && typeof p.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: p.openAtLogin }); return u; });
  handle('import:legacy', async () => { const c = settings.getSettings(); if (!c.importEnabled) return { ok: false, error: 'Disabled' }; const s = await importer.importLegacy(); if (s.ok) accounts.broadcastAccounts(); return s; });
  handle('toast:show', (_e, t, b) => { toastWindow.showToast(t, b); return true; });
  handle('test:run', (_e, c, p) => !testHarness ? { ok: false, error: 'No harness' } : testHarness.run(c, p));
  handle('test:enabled', () => testHarness ? testHarness.testEnabled() : false);
  handle('scheduler:forcePull', (_e, n) => scheduler.forcePull(n));
  const CF = { skills: 'skills-cache.json', wallet: 'wallet-cache.json', assets: 'assets-raw-cache.json', assetsNames: 'assets-names-cache.json', structures: 'structure-names.json', universe: 'universe-cache.json', charData: 'char-data-cache.json', walletData: 'wallet-data-cache.json', skillsData: 'skills-data-cache.json' };
  const clear = (n) => { try { require('fs').unlinkSync(require('path').join(app.getPath('userData'), n)); return true; } catch { return false; } };
  handle('cache:clear', (_e, w) => {
    if (w === 'all') return { cleared: [...Object.values(CF)].filter(clear) };
    const f = CF[w]; if (!f) return { cleared: [], error: `Unknown: ${w}` };
    return { cleared: clear(f) ? [f] : [] };
  });
  ipcClones.registerClonesIpc();
  ipcAssets.registerAssetsIpc();
  ipcDebug.registerDebugIpc();
}
module.exports = { registerIpcHandlers, setTestHarness };
// main/ipc.js
// VERSION: 1.17
'use strict';
const { ipcMain, app } = require('electron');
const { VERSION } = require('../version');
const accounts = require('./accounts');
const plans = require('./plans');
const settings = require('./settings');
const toastWindow = require('./toast-window');
const corpInfo = require('./corp-info');
const groups = require('./groups');
const notes = require('./notes');
const notificationHistory = require('./notification-history');
const ipcAssetsV2 = require('./ipc-assets-v2');
const ipcDebug = require('./ipc-debug');
const scheduler = require('./scheduler');
const esiStatus = require('./esi/status');
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
handle('app:getSyncState', () => {
  const pull = (name) => { try { return { characters: Object.keys(require(`./pullers/${name}`).getCache() || {}).length }; } catch { return { characters: 0 }; } };
  return {
    skills: pull('skills-data'),
    wallet: pull('wallet-data'),
    assets: pull('assets-data'),
    charData: pull('char-data'),
    clones: pull('clones-data'),
    notifications: pull('notifications-data'),
    syncer: require('./esi/syncer').getState()
  };
});
handle('app:getSequencerState', () => { const s = require('./esi/syncer').getState(); return { ...s, locked: false }; });
handle('app:getCharData', (_e, id) => require('./pullers/char-data').getCache()[id] || null);
handle('app:getSkillsData', (_e, id) => require('./pullers/skills-data').getCache()[id] || null);
handle('app:getCharacterSnapshot', (_e, id) => require('./snapshots').buildSnapshot(id) || null);
handle('app:getStructureNames', () => require('./pullers/structure-names').getCache());
handle('app:getUniverseNames', () => require('./pullers/universe-names').getCache());
handle('app:getLocationHierarchy', (_e, id) => require('./esi/static-db').getLocationHierarchy(id));
handle('accounts:list', () => accounts.getPublicAccounts());
handle('accounts:add', (_e, s) => accounts.addAccount(s));
handle('accounts:cancelLogin', () => { accounts.cancelLogin(); return true; });
handle('accounts:remove', (_e, id) => { accounts.removeAccount(id); return accounts.getPublicAccounts(); });
handle('accounts:setIgnoreNoTraining', (_e, id, val) => { accounts.setIgnoreNoTraining(id, val); return accounts.getPublicAccounts(); });
handle('accounts:refresh', async () => { await accounts.refreshAll(); return { accounts: accounts.getPublicAccounts() }; });
handle('accounts:getCorpInfo', (_e, id) => corpInfo.getCorpAlliance(id));
handle('groups:get', () => groups.getGroups());
handle('groups:create', (_e, n) => groups.createGroup(n));
handle('groups:set', (_e, id, n) => groups.setGroup(id, n));
handle('groups:setPrimary', (_e, id) => groups.setPrimary(id));
handle('groups:toggle', (_e, n) => groups.toggleCollapsed(n));
handle('skills:getCharacter', (_e, id) => require('./pullers/skills-data').getCache()[id] || null);
  handle('skills:all', async () => {
    const staticDb = require('./esi/static-db');
    await staticDb.initDb();
    return staticDb.getAllSkills();
  });
handle('notes:get', (_e, id) => notes.getNote(id));
handle('notes:set', (_e, id, t) => { const s = notes.setNote(id, t); const a = accounts.getAccounts().find(a => Number(a.characterId) === Number(id)); if (a) { a.notes = s; accounts.broadcastAccounts(); } return s; });
handle('notifications:getUnseen', (_e, id) => notificationHistory.getUnseen(id));
handle('notifications:getAll', (_e, id) => notificationHistory.getAll(id));
handle('notifications:markSeen', (_e, id) => notificationHistory.markSeen(id));
handle('notifications:getLastViewed', (_e, id) => notificationHistory.getLastViewed(id));
handle('notifications:getAllUnseenCounts', () => notificationHistory.getAllUnseenCounts());
  handle('notifications:getAllUnseenLevels', () => {
    const warnHours = Number(settings.getSettings().queueWarnHours ?? 24) || 24;
    const warnMs = warnHours * 60 * 60 * 1000;
    const helpers = require('../eve/dashboard-helpers');
    const levels = {};
    for (const acc of accounts.getAccounts()) {
      if (acc.testPilot) continue;
      const unseen = notificationHistory.getUnseen(acc.characterId);
      let queue = null;
      let hasQueueData = false;
      try {
        const c = require('./pullers/skills-data').getCache()[String(acc.characterId)];
        if (c && Array.isArray(c.queue)) { queue = c.queue; hasQueueData = true; }
      } catch {}
      if (queue == null && Array.isArray(acc.queue)) { queue = acc.queue; hasQueueData = true; }
      if (queue == null) queue = [];
      const active = helpers.getActiveSkill(queue) || acc.activeSkill || null;
      const times = helpers.getQueueTimes(queue);
      const remaining = times.lastFinish != null ? times.remainingMs : Number(acc.queueRemainingMs || 0);
      const hasTraining = Boolean(active) || queue.length > 0;
      const suppressed = Boolean(acc.ignoreNoTraining);

      let level = 0;
      if (hasQueueData && !hasTraining && !suppressed) level = 1;
      else if (hasTraining && remaining > 0 && remaining <= warnMs) level = 2;
      else if (unseen.length > 0) level = 3;
      levels[String(acc.characterId)] = level;
    }
    return levels;
  });
handle('plans:readClipboard', () => plans.readClipboardPlan());
handle('plans:list', () => plans.loadPlans());
handle('plans:save', (_e, p) => plans.savePlan(p));
handle('plans:delete', (_e, id) => plans.deletePlan(id));
  handle('plans:exportClipboard', (_e, id) => plans.exportPlanToClipboard(id));
handle('settings:get', () => settings.getSettings());
handle('settings:set', (_e, p) => { const u = settings.setSettings(p); if (p && typeof p.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: p.openAtLogin }); return u; });
handle('toast:show', (_e, t, b) => { if (process.platform === 'win32') { toastWindow.showToast(t, b); } else { require('./native-notifications').show(t, b, null); } return true; });
handle('toast:startMove', () => toastWindow.startMove());
handle('toast:endMove', () => toastWindow.endMove());
handle('test:run', (_e, c, p) => !testHarness ? { ok: false, error: 'No harness' } : testHarness.run(c, p));
handle('test:enabled', () => testHarness ? testHarness.testEnabled() : false);
handle('scheduler:forcePull', (_e, n) => scheduler.forcePull(n));
handle('esi:status', () => esiStatus.getStatus());
handle('esi:timers', () => scheduler.getNextRuns());
const CF = { skills: 'skills-cache.json', wallet: 'wallet-cache.json', assets: 'assets-raw-cache.json', assetsNames: 'assets-names-cache.json', structures: 'structure-names.json', universe: 'universe-cache.json', charData: 'char-data-cache.json', walletData: 'wallet-data-cache.json', skillsData: 'skills-data-cache.json', clonesData: 'clones-data-cache.json', universeNames: 'universe-names-cache.json', structureNames: 'structure-names.json', assetsData: 'assets-data-cache.json', notificationsData: 'notifications-data-cache.json' };
const clear = (n) => { try { require('fs').unlinkSync(require('path').join(app.getPath('userData'), n)); return true; } catch { return false; } };
handle('cache:clear', (_e, w) => {
if (w === 'all') { const r = { cleared: [...Object.values(CF)].filter(clear) }; require('./snapshots').invalidateCache(); return r; }
const f = CF[w]; if (!f) return { cleared: [], error: `Unknown: ${w}` };
const r = { cleared: clear(f) ? [f] : [] };
require('./snapshots').invalidateCache();
return r;
});
ipcAssetsV2.registerAssetsV2Ipc();
ipcDebug.registerDebugIpc();
const updater = require('./updater');
updater.registerUpdaterIpc();
}
module.exports = { registerIpcHandlers, setTestHarness };
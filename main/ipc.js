// main/ipc.js
// VERSION: 1.17
'use strict';
const { ipcMain, app, dialog } = require('electron');
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
const cloneNicknames = require('./clone-nicknames');
handle('clones:getNicknames', (_e, id) => cloneNicknames.getNicknames(id));
handle('clones:setNickname', (_e, id, locationId, name) => {
  const map = cloneNicknames.setNickname(id, locationId, name);
  const a = accounts.getAccounts().find(a => Number(a.characterId) === Number(id));
  if (a) require('./snapshots').broadcastSnapshot(a.characterId);
  return map;
});
handle('notifications:getUnseen', (_e, id) => notificationHistory.getUnseen(id));
handle('notifications:getAll', (_e, id) => notificationHistory.getAll(id));
handle('notifications:markSeen', (_e, id) => notificationHistory.markSeen(id));
handle('notifications:getLastViewed', (_e, id) => notificationHistory.getLastViewed(id));
handle('notifications:getAllUnseenCounts', () => notificationHistory.getAllUnseenCounts());
  handle('notifications:getAllUnseenLevels', () => {
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
      const suppressed = Boolean(acc.ignoreNoTraining);

      let level = 0;
      if (hasQueueData && !suppressed) {
        if (queue.length === 0) level = 2;  // Nothing in skill queue → orange
        else if (!active) level = 1;        // No active skill training → red
        else {
          const s = settings.getSettings() || {};
          const warnHours = Number(s.queueWarnHours ?? 24) || 24;
          const warnMs = warnHours * 60 * 60 * 1000;
          const times = helpers.getQueueTimes(queue);
          // Queue has active training but remaining time hits the user's warn
          // threshold → orange (same tier as the empty-queue pulse).
          if (times.lastFinish != null && times.remainingMs > 0 && times.remainingMs <= warnMs) level = 2;
        }
      }
      if (level === 0 && unseen.length > 0) level = 3;
      levels[String(acc.characterId)] = level;
    }
    return levels;
  });
handle('notifications:export', async (_e, charId) => {
  const fs = require('fs');
  const id = String(charId);
  const notifData = require('./pullers/notifications-data').getCache()[id];
  const notifications = (notifData && notifData.notifications) || [];
  const acc = accounts.getAccounts().find((a) => Number(a.characterId) === Number(id));
  const names = require('./pullers/universe-names').getCache();
  const staticDb = require('./esi/static-db');
  await staticDb.initDb();
  const { annotate, ESI_RESOLVABLE, createLocalResolver } = require('../eve/notification-ids');
  const resolveName = createLocalResolver({
    names,
    getTypeName: (i) => staticDb.getTypeName(i),
    getSystemName: (i) => staticDb.getSystemName(i),
    getStationName: (i) => staticDb.getStationName(i),
    getConstellationName: (i) => staticDb.getConstellationName(i),
    getRegionName: (i) => staticDb.getRegionName(i),
    getFactionName: (i) => staticDb.getFactionName(i)
  });

  const rows = notifications.map((n) => {
    const ann = annotate(n.text, resolveName);
    return {
      notification_id: n.notification_id,
      type: n.type,
      date: n.date,
      is_read: Boolean(n.is_read),
      sender_id: n.sender_id,
      sender_type: n.sender_type,
      sender_name: names[n.sender_id] || `#${n.sender_id}`,
      text: n.text || '',
      resolvedText: ann.resolvedText || n.text || '',
      ids: ann.ids
    };
  });

  const unresolvedMap = new Map();
  for (const r of rows) {
    for (const i of r.ids || []) {
      if (i.resolved) continue;
      if (!unresolvedMap.has(i.id)) unresolvedMap.set(i.id, { id: i.id, kind: i.kind, keys: new Set() });
      unresolvedMap.get(i.id).keys.add(i.key);
    }
  }
  const unresolvedIds = [...unresolvedMap.values()].map((u) => ({ id: u.id, kind: u.kind, keys: [...u.keys] }));

  const report = {
    app: 'EVE Status Perception',
    version: VERSION,
    exportedAt: new Date().toISOString(),
    characterId: Number(id),
    characterName: acc?.characterName || 'Unknown',
    counts: {
      total: notifications.length,
      unseen: notifications.filter((n) => !n.is_read).length,
      unresolved: unresolvedIds.length
    },
    notifications: rows,
    unresolvedIdsSummary: unresolvedIds
  };

  const { canceled, filePath } = await dialog.showSaveDialog({
    title: 'Export Notifications',
    defaultPath: `esp-notifications-${(acc?.characterName || id).replace(/[^A-Za-z0-9_-]+/g, '_')}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false, canceled: true };

  fs.writeFileSync(filePath, JSON.stringify(report, null, 2), 'utf8');

  const esiIds = [...new Set(unresolvedIds.filter((u) => ESI_RESOLVABLE.has(u.kind)).map((u) => u.id))];
  if (esiIds.length > 0) require('./pullers/universe-names').queueResolution(esiIds, 2);

  logger.info('NOTIF-EXPORT', `Exported ${rows.length} notifications for char ${id}`, { path: filePath, unresolved: esiIds.length });
  return { ok: true, path: filePath, count: rows.length, unresolved: esiIds.length, unresolvedTotal: unresolvedIds.length };
});
handle('plans:readClipboard', () => plans.readClipboardPlan());
handle('plans:list', () => plans.loadPlans());
handle('plans:save', (_e, p) => plans.savePlan(p));
handle('plans:delete', (_e, id) => plans.deletePlan(id));
  handle('plans:exportClipboard', (_e, id) => plans.exportPlanToClipboard(id));
handle('settings:get', () => settings.getSettings());
handle('settings:set', (_e, p) => { const u = settings.setSettings(p); if (p && typeof p.openAtLogin === 'boolean') app.setLoginItemSettings({ openAtLogin: p.openAtLogin }); if (p && typeof p.autoInstallUpdates === 'boolean') updater.applyAutoInstallSetting(); return u; });
handle('settings:pickSound', async () => {
  const res = await dialog.showOpenDialog({
    title: 'Choose a notification sound (WAV)',
    properties: ['openFile'],
    filters: [{ name: 'WAV files', extensions: ['wav'] }]
  });
  if (res.canceled || !res.filePaths.length) return { canceled: true, path: null };
  return { canceled: false, path: res.filePaths[0] };
});
handle('toast:show', (_e, t, b, sound) => { if (process.platform === 'win32') { toastWindow.showToast(t, b, sound); } else { require('./native-notifications').show(t, b, sound); } return true; });
handle('toast:startMove', () => toastWindow.startMove());
handle('toast:endMove', () => toastWindow.endMove());
handle('test:run', (_e, c, p) => !testHarness ? { ok: false, error: 'No harness' } : testHarness.run(c, p));
handle('test:enabled', () => testHarness ? testHarness.testEnabled() : false);
handle('scheduler:forcePull', (_e, n) => scheduler.forcePull(n));
handle('scheduler:eligibility', () => scheduler.getEligibility());
handle('scheduler:requeue', () => scheduler.requeueEligible());
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
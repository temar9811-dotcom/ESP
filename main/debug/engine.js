// main/debug/engine.js | Version: 2.5
'use strict';
const logger = require('./logger');
const scheduler = require('../scheduler');
const syncer = require('../esi/syncer');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const actions = new Map();
const registerAction = (name, description, handler) => actions.set(name, { name, description, handler });
const getActions = () => Array.from(actions.values()).map(a => ({ name: a.name, description: a.description }));
const runAction = async (name, payload) => {
  const action = actions.get(name);
  if (!action) return { ok: false, error: `Unknown: ${name}` };
  logger.info('ENGINE', `Running: ${name}`, payload);
  try { const result = await action.handler(payload || {}); return { ok: true, result }; }
  catch (err) { logger.error('ENGINE', `Failed: ${name}`, { error: err.message }); return { ok: false, error: err.message }; }
};
const clearFile = (name) => {
  const p = path.join(app.getPath('userData'), name);
  try { if (fs.existsSync(p)) { fs.unlinkSync(p); return { ok: true, message: 'Cleared' }; } return { ok: true, message: 'Not found' }; }
  catch (err) { return { ok: false, error: err.message }; }
};
function getMainWindow() {
  try { return require('../window-tray').getWindow(); } catch { return null; }
}
function registerV2Actions() {
  registerAction('Force Char Data Pull', 'Priority 2 pull for char data', () => { scheduler.forcePull('char-data'); return { ok: true }; });
  registerAction('Force Wallet Data Pull', 'Priority 2 pull for wallet', () => { scheduler.forcePull('wallet-data'); return { ok: true }; });
  registerAction('Force Skills Data Pull', 'Priority 2 pull for skills', () => { scheduler.forcePull('skills-data'); return { ok: true }; });
  registerAction('Force Clones Data Pull', 'Priority 2 pull for clones', () => { scheduler.forcePull('clones-data'); return { ok: true }; });
  registerAction('Force Assets Data Pull', 'Priority 2 pull for assets', () => { scheduler.forcePull('assets-data'); return { ok: true }; });
  registerAction('Force Notifications Data Pull', 'Priority 2 pull for notifications', () => { scheduler.forcePull('notifications-data'); return { ok: true }; });
  registerAction('Download Static DB', 'Downloads Fuzzwork SQLite DB', async () => {
    const db = require('../esi/static-db'); await db.downloadAndExtract(); await db.initDb(); return { ok: true };
  });
  registerAction('Clear Char Data Cache', 'Deletes char-data-cache.json', () => clearFile('char-data-cache.json'));
  registerAction('Clear Wallet Data Cache', 'Deletes wallet-data-cache.json', () => clearFile('wallet-data-cache.json'));
  registerAction('Clear Skills Data Cache', 'Deletes skills-data-cache.json', () => clearFile('skills-data-cache.json'));
  registerAction('Clear Clones Data Cache', 'Deletes clones-data-cache.json', () => clearFile('clones-data-cache.json'));
  registerAction('Clear Assets Data Cache', 'Deletes assets-data-cache.json', () => clearFile('assets-data-cache.json'));
  registerAction('Clear Notifications Data Cache', 'Deletes notifications-data-cache.json', () => clearFile('notifications-data-cache.json'));
  registerAction('Clear Universe Names Cache', 'Deletes universe-names-cache.json', () => clearFile('universe-names-cache.json'));
  registerAction('Inspect Universe Names', 'Dumps resolved names to help debug structures', () => {
    const cache = require('../pullers/universe-names').getCache();
    logger.info('INSPECT', `Universe Names Cache Size: ${Object.keys(cache).length}`);
    logger.info('INSPECT', 'First 30 entries:', Object.entries(cache).slice(0, 30));
    return { ok: true, size: Object.keys(cache).length };
  });
  registerAction('Test Update Available Popup', 'Simulates an update available event', () => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send('updater:available', { version: '1.2.2-beta' });
      return { ok: true, message: 'Sent updater:available' };
    }
    return { ok: false, error: 'Main window not found' };
  });
  registerAction('Test Changelog Popup', 'Simulates a changelog event', () => {
    const win = getMainWindow();
    if (win) {
      win.webContents.send('updater:show-changelog', {
        version: '1.2.2-beta',
        notes: 'Test changelog:\n- Fixed bug A\n- Added feature B\n- Improved performance'
      });
      return { ok: true, message: 'Sent updater:show-changelog' };
    }
    return { ok: false, error: 'Main window not found' };
  });
  registerAction('Check Syncer Queue', 'Returns syncer state', () => syncer.getState());
  registerAction('Test Skill Complete Notification', 'Records a fake skill-complete history entry and toasts', (p) => {
    const accounts = require('../accounts');
    const acc = p.characterId ? accounts.getAccounts().find(a => Number(a.characterId) === Number(p.characterId)) : null;
    const payload = {
      characterId: acc ? acc.characterId : (p.characterId || 0),
      characterName: acc ? acc.characterName : (p.characterName || 'Test Pilot'),
      skillName: p.skillName || 'Test Skill',
      level: Number(p.level) || 5,
      remainingMs: Number(p.remainingMs) || 8 * 3600000
    };
    accounts.emitSkillCompleted(payload);
    return { ok: true, payload };
  });
  registerAction('Test Queue Warning Notification', 'Records a fake queue-warning history entry and toasts', (p) => {
    const accounts = require('../accounts');
    const acc = p.characterId ? accounts.getAccounts().find(a => Number(a.characterId) === Number(p.characterId)) : null;
    const payload = {
      characterId: acc ? acc.characterId : (p.characterId || 0),
      characterName: acc ? acc.characterName : (p.characterName || 'Test Pilot'),
      remainingMs: Number(p.remainingMs) || 12 * 3600000
    };
    accounts.emitQueueWarning(payload);
    return { ok: true, payload };
  });
  registerAction('Test Queue Empty Notification', 'Records a fake queue-empty history entry and toasts', (p) => {
    const accounts = require('../accounts');
    const acc = p.characterId ? accounts.getAccounts().find(a => Number(a.characterId) === Number(p.characterId)) : null;
    const payload = {
      characterId: acc ? acc.characterId : (p.characterId || 0),
      characterName: acc ? acc.characterName : (p.characterName || 'Test Pilot')
    };
    accounts.emitQueueEmpty(payload);
    return { ok: true, payload };
  });
  registerAction('Test Wallet Activity Notification', 'Records a fake wallet-activity history entry and toasts', (p) => {
    const accounts = require('../accounts');
    const acc = p.characterId ? accounts.getAccounts().find(a => Number(a.characterId) === Number(p.characterId)) : null;
    const amount = Number(p.amount || 0) || 2500000;
    const qty = Math.max(1, Number(p.quantity) || 3);
    const payload = {
      characterId: acc ? acc.characterId : (p.characterId || 0),
      characterName: acc ? acc.characterName : (p.characterName || 'Test Pilot'),
      entries: [
        { amount: -Math.abs(amount), description: `Bought ${qty} × ${p.item || 'Test Module'}`, date: new Date().toISOString() },
        { amount: Math.abs(amount) * 1.2, description: `Sold ${qty} × ${p.item || 'Test Module'}`, date: new Date().toISOString() },
        { amount: 500000, description: 'Bounty reward received', date: new Date().toISOString() }
      ]
    };
    accounts.emitWalletActivity(payload);
    return { ok: true, payload };
  });
  registerAction('Force Refresh All', 'Runs accounts.refreshAll immediately', async () => {
    const accounts = require('../accounts');
    await accounts.refreshAll();
    return { ok: true };
  });
  registerAction('Force ESI Status Check', 'Runs a live ESI status check and logs it', async () => {
    const esiStatus = require('../esi/status');
    const status = await esiStatus.check();
    logger.info('ENGINE', 'ESI status check result', status);
    return { ok: true, status };
  });
  registerAction('Add Test Pilot', 'Adds a fake characterId/name test pilot', (p) => {
    const accounts = require('../accounts');
    const id = Math.floor(Math.random() * 900000000) + 100000000;
    const name = p.characterName || 'Test Pilot';
    accounts.addTestPilot(id, name);
    return { ok: true, characterId: id, characterName: name };
  });
  registerAction('Remove Test Pilots', 'Removes all testPilot accounts', () => {
    const accounts = require('../accounts');
    const before = accounts.getAccounts().filter(a => a.testPilot).length;
    accounts.removeTestPilots();
    return { ok: true, removed: before };
  });
  registerAction('Show Scheduler State', 'Dumps next-run timers and interval info for all pullers', () => {
    const nextRuns = scheduler.getNextRuns();
    logger.info('ENGINE', 'Scheduler state', nextRuns);
    return { ok: true, nextRuns };
  });
  registerAction('Clear Notification History', 'Wipes all recorded notification history entries', () => {
    const nh = require('../notification-history');
    nh.clearAll();
    return { ok: true };
  });
  registerAction('Inspect Notification History', 'Logs a per-character summary of the notification history store', () => {
    const nh = require('../notification-history');
    const summary = nh.getSummary();
    logger.info('ENGINE', 'Notification history summary', summary);
    return { ok: true, summary };
  });
  registerAction('Clear Character Groups', 'Resets all character group assignments', () => {
    const groups = require('../groups');
    groups.clearGroups();
    return { ok: true };
  });
  registerAction('Test Direct Toast', 'Shows a manual toast via toast-window (Windows only)', (p) => {
    const toastWindow = require('../toast-window');
    if (process.platform !== 'win32') return { ok: false, error: 'Toast overlay is Windows-only' };
    toastWindow.showToast(p.title || 'Debug Toast', p.body || 'Direct toast from debug engine', 'debug');
    return { ok: true };
  });
  registerAction('Reset Settings to Defaults', 'Restores all settings to factory defaults', () => {
    const settings = require('../settings');
    const defaults = settings.resetSettings();
    return { ok: true, defaults };
  });
  registerAction('Force Sync State Snapshot', 'Logs current sync/cache state for all pullers', () => {
    const pull = (name) => { try { return { characters: Object.keys(require(`../pullers/${name}`).getCache() || {}).length }; } catch { return { characters: 0 }; } };
    const state = {
      skills: pull('skills-data'),
      wallet: pull('wallet-data'),
      assets: pull('assets-data'),
      charData: pull('char-data'),
      clones: pull('clones-data'),
      notifications: pull('notifications-data'),
      syncer: require('../esi/syncer').getState()
    };
    logger.info('ENGINE', 'Sync state', state);
    return { ok: true, state };
  });
}
function initEngine() { logger.init(); registerV2Actions(); logger.info('ENGINE', 'Debug engine V2 initialized.'); }
module.exports = { registerAction, getActions, runAction, initEngine };
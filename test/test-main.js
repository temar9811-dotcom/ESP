'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const storage = require('../storage');
let api = null;
function modeFile() {
return path.join(__dirname, 'test-mode.json');
}
function testEnabled() {
try {
const data = JSON.parse(fs.readFileSync(modeFile(), 'utf8'));
return data.enabled === true;
} catch {
return false;
}
}
function setTestEnabled(value) {
try {
fs.writeFileSync(
modeFile(),
JSON.stringify({ enabled: Boolean(value), note: "Set enabled to false, or delete this file, to turn the test harness off. No app restart needed." }, null, 2),
'utf8'
);
} catch {
// Ignore write errors.
}
}
function sendToRenderer(channel, payload) {
const win = api && api.getWindow ? api.getWindow() : null;
if (win && !win.isDestroyed()) {
win.webContents.send(channel, payload);
return true;
}
return false;
}
function listAccountsSafe() {
const accounts = api && api.getAccounts ? api.getAccounts() : [];
return accounts.map((account) => ({
characterId: account.characterId,
characterName: account.characterName || 'Unknown',
wallet: account.wallet ?? null,
location: account.location || null,
shipName: account.shipName || null,
shipType: account.shipType || null,
activeSkill: account.activeSkill
? {
skillName: account.activeSkill.skillName,
level: account.activeSkill.finished_level,
finish: account.activeSkill.finish_date
}
: null
}));
}
function readLegacyAccounts() {
const importer = require('../main/importer');
const legacyDir = importer.findLegacyUserData();
if (!legacyDir) {
return { legacyDir: null, legacyAccounts: [] };
}
try {
const raw = fs.readFileSync(path.join(legacyDir, 'accounts.json'), 'utf8');
const data = JSON.parse(raw);
return { legacyDir, legacyAccounts: Array.isArray(data) ? data : [] };
} catch {
return { legacyDir, legacyAccounts: [] };
}
}
async function run(command, payload) {
if (!testEnabled()) {
return {
ok: false,
error: 'Test mode is disabled. Set enabled:true in the test mode config file.'
};
}
try {
const safePayload = payload && typeof payload === 'object' ? payload : {};
switch (command) {
   case 'ping': {
     return { ok: true, result: 'pong' };
   }
   case 'app.version': {
     const { VERSION } = require('../version');
     return { ok: true, result: VERSION };
   }
   case 'bubble.skill': {
     const notifications = require('../main/notifications');
     notifications.notifySkillCompleted({
       characterName: safePayload.characterName || 'Test Character',
       skillName: safePayload.skillName || 'Test Skill',
       level: safePayload.level ?? 5
     });
     return { ok: true };
   }
   case 'bubble.queue': {
     const notifications = require('../main/notifications');
     notifications.notifyQueueWarning({
       characterName: safePayload.characterName || 'Test Character',
       remainingMs: Number(safePayload.remainingMs ?? 7 * 3600000 + 25 * 60000)
     });
     return { ok: true };
   }
   case 'bubble.wallet': {
     const notifications = require('../main/notifications');
     const rawAmount = safePayload.amount;
     const parsedAmount = Number(rawAmount);
     const amount =
       rawAmount == null || !Number.isFinite(parsedAmount)
         ? 1000000
         : parsedAmount;
     notifications.notifyWalletActivity({
       characterName: safePayload.characterName || 'Test Character',
       entries: [
         {
           description: safePayload.description || 'Test transaction',
           amount
         }
       ]
     });
     return { ok: true };
   }
   case 'accounts.summary': {
     return { ok: true, result: listAccountsSafe() };
   }
   case 'app.refresh': {
     if (api && api.refreshAll) {
       await api.refreshAll();
       return { ok: true };
     }
     return { ok: false, error: 'refreshAll not available.' };
   }
   case 'app.showWindow': {
     if (api && api.showWindow) {
       api.showWindow();
       return { ok: true };
     }
     return { ok: false, error: 'showWindow not available.' };
   }
   case 'login.cancelIdle': {
     const accountsMod = require('../main/accounts');
     accountsMod.cancelLogin();
     return { ok: true, result: 'cancelLogin() ran with no pending login.' };
   }
   case 'groups.read': {
     const groups = require('../main/groups');
     const groupMap = await groups.getGroups();
     return { ok: true, result: Object.keys(groupMap || {}) };
   }
   case 'settings.roundtrip': {
     const settings = require('../main/settings');
     const before = settings.getSettings();
     const testVal = Number(before.queueWarnHours) === 5 ? 6 : 5;
     settings.setSettings({ queueWarnHours: testVal });
     const mid = settings.getSettings();
     settings.setSettings({ queueWarnHours: before.queueWarnHours });
     const after = settings.getSettings();
     return {
       ok: Number(mid.queueWarnHours) === testVal &&
         Number(after.queueWarnHours) === Number(before.queueWarnHours),
       result: {
         original: before.queueWarnHours,
         testVal,
         restored: after.queueWarnHours
       }
     };
   }
   case 'plans.roundtrip': {
     const plans = require('../main/plans');
     const temp = {
       name: 'ESP Self-Test Plan',
       scope: 'global',
       characterId: null,
       entries: [{ skillId: 3412, name: 'Self Test Skill', level: 4 }]
     };
     await plans.savePlan(temp);
     const list = await plans.loadPlans();
     const found = (list || []).find(
       (p) => p.name === 'ESP Self-Test Plan'
     );
     if (!found) {
       return { ok: false, error: 'Saved plan not found in list.' };
     }
     await plans.deletePlan(found.id);
     const after = await plans.loadPlans();
     const gone = !(after || []).some((p) => p.id === found.id);
     return { ok: gone, result: { savedId: found.id, deleted: gone } };
   }
   case 'skills.meta': {
     const skillMeta = require('../main/skill-meta');
     const accountsMod = require('../main/accounts');
     const withQueue = accountsMod
       .getAccounts()
       .find((a) => Array.isArray(a.queue) && a.queue.length);
     const ids = withQueue
       ? withQueue.queue.slice(0, 3).map((q) => q.skill_id).filter(Boolean)
       : [3412];
     const meta = await skillMeta.getMetaForIds(ids);
     const ranks = ids.map((id) => ({
       id,
       rank: meta && meta[id] ? meta[id].rank : null
     }));
     return {
       ok: ranks.every((r) => r.rank != null),
       result: ranks
     };
   }
   case 'wallet.details': {
     const accountsMod = require('../main/accounts');
     const eve = require('../eve');
     const first = accountsMod.getAccounts()[0];
     if (!first) {
       return { ok: false, error: 'No characters added.' };
     }
     const token = await accountsMod.getValidAccessToken(first, false);
     const details = await eve.getWalletDetails(first.characterId, token, 7);
     return {
       ok: true,
       result: {
         character: first.characterName,
         keys: Object.keys(details || {})
       }
     };
   }
   case 'corp.info': {
     const corpInfo = require('../main/corp-info');
     const accountsMod = require('../main/accounts');
     const first = accountsMod.getAccounts()[0];
     if (!first) {
       return { ok: false, error: 'No characters added.' };
     }
     const info = await corpInfo.getCorpAlliance(first.characterId);
     return { ok: true, result: info };
   }
   case 'debug.legacy': {
     const storage = require('../storage');
     const accountsMod = require('../main/accounts');
     const { legacyDir, legacyAccounts } = readLegacyAccounts();
     if (!legacyDir) {
       return { ok: true, result: { legacyDir: null } };
     }
     const espAccounts = accountsMod.getAccounts();
     const rows = legacyAccounts.map((old) => {
       const decrypted = storage.decryptSecret(old.refreshTokenEnc);
       const esp = espAccounts.find(
         (a) => Number(a.characterId) === Number(old.characterId)
       );
       return {
         characterId: old.characterId,
         characterName: old.characterName || 'Unknown',
         inEsp: Boolean(esp),
         espLastError: esp ? esp.lastError || null : null,
         decryptedLength: decrypted.length,
         decryptedPrintable: /^[ -~]+$/.test(decrypted)
       };
     });
     return { ok: true, result: { legacyDir, rows } };
   }
   case 'debug.legacyMigrate': {
     const storage = require('../storage');
     const accountsMod = require('../main/accounts');
     const eve = require('../eve');
     const { legacyDir, legacyAccounts } = readLegacyAccounts();
     if (!legacyDir) {
       return { ok: false, error: 'Legacy folder not found.' };
     }
     const espAccounts = accountsMod.getAccounts();
     const results = [];
     for (const old of legacyAccounts) {
       const esp = espAccounts.find(
         (a) => Number(a.characterId) === Number(old.characterId)
       );
       if (!esp) {
         results.push({ characterId: old.characterId, status: 'not-in-esp' });
         continue;
       }
       const plaintext = storage.decryptSecret(old.refreshTokenEnc);
       try {
         const tokens = await eve.refreshAccessToken(plaintext);
         esp.refreshTokenEnc = storage.encryptSecret(tokens.refreshToken);
         esp.accessTokenEnc = storage.encryptSecret(tokens.accessToken);
         esp.accessTokenExpiresAt = tokens.expiresAt;
         esp.lastError = null;
         results.push({ characterId: old.characterId, status: 'migrated' });
       } catch (err) {
         results.push({
           characterId: old.characterId,
           status: 'failed',
           error: err?.message || String(err)
         });
       }
     }
     await accountsMod.refreshAll();
     return { ok: true, result: { legacyDir, results } };
   }
   case 'debug.toastdev': {
     const { BrowserWindow } = require('electron');
     const overlay = BrowserWindow.getAllWindows().find((w) =>
       (w.webContents.getURL() || '').includes('toast.html')
     );
     if (!overlay) {
       return { ok: false, error: 'Overlay window not found.' };
     }
     overlay.webContents.openDevTools({ mode: 'detach' });
     return { ok: true };
   }
   case 'debug.toastping': {
     const toastWindow = require('../main/toast-window');
     toastWindow.showToast('Main ping', 'Direct from main process');
     return { ok: true };
   }
   case 'history.inject': {
     const skillHistory = require('../main/skill-history');
     const accountsMod = require('../main/accounts');
     const target =
       accountsMod
         .getAccounts()
         .find(
           (a) => Number(a.characterId) === Number(safePayload.characterId)
         ) || accountsMod.getAccounts()[0];
     if (!target) {
       return { ok: false, error: 'No characters added.' };
     }
     const now = Date.now();
     const samples = [
       { skillId: 999901, skillName: 'Test Injection Alpha', level: 4, finishedAt: new Date(now - 2 * 3600000).toISOString() },
       { skillId: 999902, skillName: 'Test Injection Beta', level: 5, finishedAt: new Date(now - 26 * 3600000).toISOString() },
       { skillId: 999903, skillName: 'Test Injection Gamma', level: 3, finishedAt: new Date(now - 3 * 86400000).toISOString() },
       { skillId: 999904, skillName: 'Test Injection Delta', level: 4, finishedAt: new Date(now - 4 * 86400000).toISOString() },
       { skillId: 999905, skillName: 'Test Injection Epsilon', level: 2, finishedAt: new Date(now - 5 * 86400000).toISOString() },
       { skillId: 999906, skillName: 'Test Injection Zeta', level: 1, finishedAt: new Date(now - 6 * 86400000).toISOString() }
     ];
     for (const s of samples) {
       skillHistory.recordCompletion(target.characterId, {
         ...s,
         test: true
       });
     }
     target.recentCompletions = skillHistory.getRecent(
       target.characterId,
       7
     );
     accountsMod.broadcastAccounts();
     setTimeout(() => {
       skillHistory.removeTestEntries(target.characterId);
       target.recentCompletions = skillHistory.getRecent(
         target.characterId,
         7
       );
       accountsMod.broadcastAccounts();
     }, 120000);
     return {
       ok: true,
       result: {
         character: target.characterName,
         injected: samples.length,
         note: 'Test entries auto-remove after 120 seconds.'
       }
     };
   }
   case 'accounts.exportTokens': {
     const accountsMod = require('../main/accounts');
     const out = [];
     for (const account of accountsMod.getAccounts()) {
       let accessToken = null;
       try {
         accessToken = await accountsMod.getValidAccessToken(account, false);
       } catch {
         accessToken = storage.decryptSecret(account.accessTokenEnc) || null;
       }
       out.push({
         characterId: Number(account.characterId),
         characterName: account.characterName || null,
         refreshToken: storage.decryptSecret(account.refreshTokenEnc) || null,
         accessToken,
         expiresAt: account.accessTokenExpiresAt || null,
         scopes: Array.isArray(account.scopes)
           ? account.scopes.join(' ')
           : (account.scopes || '')
       });
     }
     const file = path.join(app.getPath('userData'), 'token-export.json');
     fs.mkdirSync(path.dirname(file), { recursive: true });
     fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
     return { ok: true, result: { exported: out.length, file } };
   }
   case 'test:disable': {
     setTestEnabled(false);
     return { ok: true, result: { testMode: false } };
   }
   default: {
     return { ok: false, error: `Unknown test command: ${command}` };
   }
 }
} catch (err) {
return { ok: false, error: (err && err.message) || String(err) };
}
}
function init(injectedApi) {
api = injectedApi || null;
}
module.exports = {
init,
run,
testEnabled
};
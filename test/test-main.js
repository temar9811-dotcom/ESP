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
      case 'assets.debug': {
     const accountsMod = require('../main/accounts');
     const assetsMod = require('../main/assets');
     const { publicFetch, esiFetch } = require('../eve/http');

     const target = accountsMod.getAccounts()[0];
     if (!target) return { ok: false, error: 'No characters added.' };
     const token = await accountsMod.getValidAccessToken(target, false);

     const raw = await assetsMod.getCharacterAssets(target.characterId, token);

     const typeCounts = {};
     const onePerType = {};
     for (const a of raw) {
       typeCounts[a.location_type] = (typeCounts[a.location_type] || 0) + 1;
       if (!onePerType[a.location_type]) onePerType[a.location_type] = a;
     }

     const sysSample = raw.find((a) => a.location_type === 'solar_system');
     const stSample = raw.find((a) => a.location_type === 'station');
     const strSample = raw.find((a) => a.location_type === 'structure');

     let systemRaw = null;
     let regionRaw = null;
     if (sysSample) {
       try {
         systemRaw = await publicFetch(`/universe/systems/${sysSample.location_id}/`);
       } catch (e) {
         systemRaw = { error: e?.status ?? '', message: e?.message || String(e) };
       }
       if (systemRaw && systemRaw.region_id != null) {
         try {
           regionRaw = await publicFetch(`/universe/regions/${systemRaw.region_id}/`);
         } catch (e) {
           regionRaw = { error: e?.status ?? '', message: e?.message || String(e) };
         }
       }
     }

     let stationRaw = null;
     if (stSample) {
       try {
         stationRaw = await publicFetch(`/universe/stations/${stSample.location_id}/`);
       } catch (e) {
         stationRaw = { error: e?.status ?? '', message: e?.message || String(e) };
       }
     }

     let structureRaw = null;
     if (strSample) {
       try {
         structureRaw = await esiFetch(`/universe/structures/${strSample.location_id}/`, token);
       } catch (e) {
         structureRaw = { error: e?.status ?? '', message: e?.message || String(e) };
       }
     }

     return {
       ok: true,
       result: {
         character: target.characterName,
         totalAssets: raw.length,
         typeCounts,
         onePerType,
         sysSampleId: sysSample ? sysSample.location_id : null,
         systemRaw,
         regionRaw,
         stationRaw,
         structureRaw
       }
     };
   }
      case 'assets.debug2': {
     const accountsMod = require('../main/accounts');
     const assetsMod = require('../main/assets');
     const { publicFetch } = require('../eve/http');

     const target = accountsMod.getAccounts()[0];
     if (!target) return { ok: false, error: 'No characters added.' };
     const token = await accountsMod.getValidAccessToken(target, false);

     const raw = await assetsMod.getCharacterAssets(target.characterId, token);
     const stSample = raw.find((a) => a.location_type === 'station');

     let stationRaw = null;
     let systemRaw = null;
     let regionRaw = null;

     if (stSample) {
       try {
         stationRaw = await publicFetch(`/universe/stations/${stSample.location_id}/`);
       } catch (e) {
         stationRaw = { error: e?.message || String(e) };
       }
       if (stationRaw && stationRaw.system_id != null) {
         try {
           systemRaw = await publicFetch(`/universe/systems/${stationRaw.system_id}/`);
         } catch (e) {
           systemRaw = { error: e?.message || String(e) };
         }
         if (systemRaw && systemRaw.region_id != null) {
           try {
             regionRaw = await publicFetch(`/universe/regions/${systemRaw.region_id}/`);
           } catch (e) {
             regionRaw = { error: e?.message || String(e) };
           }
         }
       }
     }

     const tree = await assetsMod.buildAssetTree(raw, token);

     return {
       ok: true,
       result: {
         stationId: stSample ? stSample.location_id : null,
         systemRaw,
         regionRaw,
         treeRegionKeys: Object.keys(tree.regions),
         treeSystemsByRegion: Object.entries(tree.regions).map(
           ([name, region]) => ({ region: name, systems: Object.keys(region.systems) })
         )
       }
     };
   }
   case 'assets.clearStructureFailures': {
     const assetsMod = require('../main/assets');
     const removed = assetsMod.clearStructureFailures();
     return { ok: true, result: { removed } };
   }
   case 'assets.resolveNames': {
     // Force a full sequenced name-resolution pass now (bypasses the 24h
     // timer). Queues behind the ESI sequencer like the scheduled run.
     const assetsNamesMod = require('../main/assets-names');
     const result = await assetsNamesMod.pull();
     return { ok: true, result };
   }
   case 'assets.pullRaw': {
     // Force a raw asset pull for all characters now (bypasses the 45min
     // timer). The name resolver reads this raw cache, so run this first
     // after clearing the raw cache.
     const assetsSyncMod = require('../main/assets-sync');
     const result = await assetsSyncMod.pull();
     return { ok: true, result };
   }
    case 'assets.namesDiag': {
      // Diagnose name resolution: per character, the granted scopes, whether
      // structures can be read, and a breakdown of resolved location kinds.
      const accountsMod = require('../main/accounts');
      const assetsNamesMod = require('../main/assets-names');
      const assetsSyncMod = require('../main/assets-sync');
      const assetsMod = require('../main/assets');
      const list = accountsMod.getAccounts();
      const out = [];
      for (const target of list) {
        accountsMod.ensureScopes(target);
        const scopeList = typeof target.scopes === 'string'
          ? target.scopes.split(' ').filter(Boolean)
          : Array.isArray(target.scopes) ? target.scopes : null;
        const canReadStructures =
          scopeList == null || scopeList.includes('esi-universe.read_structures.v1');
        const names = assetsNamesMod.getNames(target.characterId);
        const kinds = {};
        if (names && names.locations) {
          for (const info of Object.values(names.locations)) {
            const k = (info && info.kind) || 'unknown';
            kinds[k] = (kinds[k] || 0) + 1;
          }
        }
        // Raw-asset walk diagnostics: how many items find their parent chain.
        const raw = assetsSyncMod.getRaw(target.characterId);
        let rawCount = 0;
        let orphanCount = 0;
        let itemTopCount = 0;
        const topLocTypes = {};
        let maxItemId = 0;
        let maxLocationId = 0;
        let lastPageSize = null;

        // Corp raw cache for this character's corp — lets the walk continue
        // through corp-owned parents (hangar divisions / corp ships / etc.).
        let corpByItemId = null;
        let corpRawCount = 0;
        try {
          const corpId = target.corporationId || null;
          if (corpId) {
            const corpRaw = assetsSyncMod.getCorpRaw(corpId);
            if (corpRaw && Array.isArray(corpRaw.assets) && corpRaw.assets.length) {
              corpByItemId = assetsMod.buildCorpMap(corpRaw.assets);
              corpRawCount = corpRaw.assets.length;
            }
          }
        } catch {
          corpByItemId = null;
        }

        if (raw && Array.isArray(raw.assets)) {
          rawCount = raw.assets.length;
          const byItemId = new Map(raw.assets.map((a) => [Number(a.item_id), a]));
          for (const a of raw.assets) {
            if (typeof a.item_id === 'number' && a.item_id > maxItemId) maxItemId = a.item_id;
            if (typeof a.location_id === 'number' && a.location_id > maxLocationId) maxLocationId = a.location_id;
          }
          const seenTops = new Set();
          const missingParents = new Set();
          for (const asset of raw.assets) {
            const { top, missingParentId } = assetsMod.walkToTop(asset, byItemId);
            if (!top) {
              orphanCount++;
              if (missingParentId != null) missingParents.add(Number(missingParentId));
              continue;
            }
            if (seenTops.has(top.item_id)) continue;
            seenTops.add(top.item_id);
            const t = top.location_type || 'unknown';
            topLocTypes[t] = (topLocTypes[t] || 0) + 1;
            if (t === 'item') itemTopCount++;
          }
          // Are the "missing" parents actually present as item_ids? If yes,
          // the walk lookup is broken; if no, the raw pull genuinely lacks them.
          let missingButPresent = 0;
          for (const pid of missingParents) {
            if (byItemId.has(pid)) missingButPresent++;
          }
          var diagMissingParentCount = missingParents.size;
          var diagMissingButPresent = missingButPresent;

          // Corp-map pass: walk with the corp map and count how many previously
          // orphaned rows now reach a top, plus which missing parents get covered.
          let corpOrphanCount = 0;
          let corpCoveredParents = 0;
          if (corpByItemId) {
            for (const pid of missingParents) {
              if (corpByItemId.has(pid)) corpCoveredParents++;
            }
            for (const asset of raw.assets) {
              const r = assetsMod.walkToTop(asset, byItemId, corpByItemId);
              if (!r.top) corpOrphanCount++;
            }
          }
          var diagCorpCoveredParents = corpCoveredParents;
          var diagCorpOrphanCount = corpByItemId ? corpOrphanCount : null;

          // Sample up to 8 orphan rows with their flags + missing parent, so
          // we can see what these parents actually are (hangar root / office /
          // corp SAG / active ship) from the location_flag pattern.
          var orphanSamples = [];
          {
            const seenParents = new Set();
            for (const asset of raw.assets) {
              if (orphanSamples.length >= 8) break;
              const { top, missingParentId } = assetsMod.walkToTop(asset, byItemId);
              if (top || missingParentId == null) continue;
              const pid = Number(missingParentId);
              if (seenParents.has(pid)) continue;
              seenParents.add(pid);
              const corpRow = corpByItemId ? corpByItemId.get(pid) || null : null;
              orphanSamples.push({
                item_id: asset.item_id,
                type_id: asset.type_id,
                location_id: asset.location_id,
                location_type: asset.location_type,
                location_flag: asset.location_flag,
                is_singleton: asset.is_singleton,
                missingParentId: pid,
                corpParent: corpRow
                  ? {
                      location_id: corpRow.location_id,
                      location_type: corpRow.location_type,
                      location_flag: corpRow.location_flag,
                      type_id: corpRow.type_id
                    }
                  : null
              });
            }
          }
        }
        out.push({
          character: target.characterName,
          characterId: target.characterId,
          canReadStructures,
          scopes: scopeList,
          resolved: names ? Object.keys(names.locations).length : 0,
          fetchedAt: names ? names.fetchedAt : null,
          kinds,
          rawCount,
          orphanCount,
          itemTopCount,
          topLocTypes,
          maxItemId,
          maxItemIdSafe: Number.isSafeInteger(maxItemId),
          maxLocationId,
          maxLocationIdSafe: Number.isSafeInteger(maxLocationId),
          missingParentCount: typeof diagMissingParentCount === 'number' ? diagMissingParentCount : 0,
          missingButPresent: typeof diagMissingButPresent === 'number' ? diagMissingButPresent : 0,
          corpRawCount,
          corpCoveredParents: typeof diagCorpCoveredParents === 'number' ? diagCorpCoveredParents : 0,
          corpOrphanCount: typeof diagCorpOrphanCount !== 'undefined' ? diagCorpOrphanCount : null,
          orphanSamples: typeof orphanSamples !== 'undefined' ? orphanSamples : []
        });
      }
      return { ok: true, result: out };
    }
   case 'assets.locationClassify': {
     // Runs the pure location classifier over every top-level asset
     // location for a real character: station / planet / solar system /
     // item, and the item range split into ship / container / structure.
     const accountsMod = require('../main/accounts');
     const assetsMod = require('../main/assets');
     const { publicFetch } = require('../eve/http');
     const {
       classifyLocationId,
       classifyTypeCategory
     } = require('../main/location-classifier');

     const list = accountsMod.getAccounts();
     const target =
       (payload && payload.id && list.find((a) => Number(a.characterId) === Number(payload.id))) ||
       list[0] ||
       null;
     if (!target) return { ok: false, error: 'No characters added.' };
     const token = await accountsMod.getValidAccessToken(target, false);
     const raw = await assetsMod.getCharacterAssets(target.characterId, token);

     const byItemId = new Map(raw.map((a) => [a.item_id, a]));
     const seen = new Set();
     const counts = {};
     const examples = {};
     const catCache = new Map(); // type_id -> category_id (one fetch per type)

     const categoryOf = async (typeId) => {
       if (catCache.has(typeId)) return catCache.get(typeId);
       let cat = null;
       try {
         const t = await publicFetch(`/universe/types/${typeId}/`);
         cat = t && t.category_id != null ? Number(t.category_id) : null;
       } catch {
         cat = null;
       }
       catCache.set(typeId, cat);
       return cat;
     };

     const bump = (kind, id) => {
       counts[kind] = (counts[kind] || 0) + 1;
       if (!examples[kind]) examples[kind] = id;
     };

     for (const asset of raw) {
       if (seen.has(asset.location_id)) continue;
       seen.add(asset.location_id);

       const piContext = (asset.location_flag || '').toLowerCase() === 'autofit';
       const broad = classifyLocationId(asset.location_id, asset.location_type, {
         piContext
       });

       if (broad !== 'item') {
         bump(broad, asset.location_id);
         continue;
       }

       // Split the item range via the containing item's type category.
       const container = byItemId.get(asset.location_id);
       if (container && container.type_id != null) {
         const cat = await categoryOf(container.type_id);
         bump(cat != null ? classifyTypeCategory(cat) : 'item', asset.location_id);
       } else {
         bump('item (unresolved)', asset.location_id);
       }
     }

     return { ok: true, result: { characterId: target.characterId, total: raw.length, uniqueLocations: seen.size, counts, examples } };
   }
   case 'assets.structureAudit': {
     const queue = require('../main/assets-queue');
     const accountsMod = require('../main/accounts');
     const assetsMod = require('../main/assets');

     const list = accountsMod.getAccounts();
     const target =
       (payload && payload.id && list.find((a) => Number(a.characterId) === Number(payload.id))) ||
       list[0] ||
       null;
     if (!target) return { ok: false, error: 'No characters added.' };

     accountsMod.ensureScopes(target);
     const scopeList = typeof target.scopes === 'string'
       ? target.scopes.split(' ').filter(Boolean)
       : Array.isArray(target.scopes) ? target.scopes : null;
     const canReadStructures =
       scopeList == null || scopeList.includes('esi-universe.read_structures.v1');

     const disk = assetsMod.getStructureDiskCache();
     const markers = Object.entries(disk)
       .filter(
         ([, entry]) =>
           (entry.name || '').startsWith('Structure ') ||
           entry.failedAt != null ||
           entry.failedUntil != null
       )
       .map(([id, entry]) => ({
         id: Number(id),
         name: entry.name || null,
         status: entry.status || null,
         systemId: entry.systemId != null ? Number(entry.systemId) : null,
         savedAt: entry.savedAt || null,
         failedAt: entry.failedAt || null,
         failedUntil: entry.failedUntil || null
       }));

     let probe = null;
     let probeAll = null;
     if (markers.length) {
       try {
         const token = await accountsMod.getValidAccessToken(target, false);
         await accountsMod.waitRateLimit();
         probe = await assetsMod.probeStructure(markers[0].id, token);
         probe.id = markers[0].id;
       } catch (err) {
         probe = { ok: false, error: String(err && err.message || err) };
       }

       if (payload && payload.probeAll) {
         probeAll = [];
         try {
           const token = await accountsMod.getValidAccessToken(target, false);
           for (const marker of markers) {
             await accountsMod.waitRateLimit();
             const result = await assetsMod.probeStructure(marker.id, token);
             probeAll.push({ id: marker.id, ...result });
           }
         } catch (err) {
           probeAll.push({ error: String(err && err.message || err) });
         }
       }
     }

     return {
       ok: true,
       result: {
         character: target.characterName,
         canReadStructures,
         scopes: scopeList,
         markers,
         probe,
         probeAll,
         queueRunning: queue.isRunning()
       }
     };
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
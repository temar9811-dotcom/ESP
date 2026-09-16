// main/pullers/structure-names.js
// VERSION: 1.1
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const CACHE_FILE = 'structure-names.json';
let cache = {};
let loaded = false;
function load() {
if (loaded) return;
loaded = true;
try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}
function save() {
try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch {}
}
function getScopedAccount() {
for (const acc of accounts.getAccounts()) {
if (acc.testPilot) continue;
const scopes = accounts.ensureScopes(acc);
if (scopes && scopes.includes('esi-universe.read_structures.v1')) return acc;
}
return null;
}
async function resolve(ids) {
load();
logger.debug('STRUCTURES', 'resolve() called', { inputCount: ids.length, inputIds: ids.slice(0, 20) });
const now = Date.now();
const unknown = ids.filter(id => {
const c = cache[id];
if (!c) return true;
if (c.failed && c.expiresAt > now) return false;
if (c.name) return false;
return true;
});
logger.debug('STRUCTURES', 'After cache filter', { unknownCount: unknown.length, unknownIds: unknown.slice(0, 20) });
if (unknown.length === 0) { logger.debug('STRUCTURES', 'All IDs already cached, skipping'); return; }
const acc = getScopedAccount();
if (!acc) { logger.warn('STRUCTURES', 'No account with read_structures scope. Skipping.'); return; }
logger.debug('STRUCTURES', 'Using scoped account', { characterId: acc.characterId, name: acc.characterName });
let token;
try { token = await accounts.getValidAccessToken(acc, false); }
catch (e) { logger.error('STRUCTURES', 'Token fail', { error: e.message }); return; }
for (const id of unknown) {
try {
const url = `https://esi.evetech.net/latest/universe/structures/${id}/?datasource=tranquility`;
logger.debug('STRUCTURES', 'Fetching structure', { id, url });
const res = await fetcher.request(url, token);
cache[id] = { name: res.data.name, system_id: res.data.solar_system_id };
logger.info('STRUCTURES', `Resolved ${res.data.name}`, { id });
} catch (err) {
if (err.status === 403 || err.status === 404) {
cache[id] = { failed: true, expiresAt: now + 3600000 };
logger.warn('STRUCTURES', `Structure ${id} not accessible`, { status: err.status });
} else {
logger.error('STRUCTURES', `Fetch failed for ${id}`, { error: err.message, status: err.status });
}
}
}
save();
}
module.exports = { resolve, getCache: () => { load(); return cache; } };
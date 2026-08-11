const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');
const SCOPES = require('./scopes');
const config = {
clientId: "276100afb30f4c3eb527d65f2ec7c3e5",
redirectUri: "http://127.0.0.1:8635/callback",
scopes: SCOPES,
userAgent: "EVE Status Perception/1.1"
};
const ESI_BASE = 'https://esi.evetech.net/latest';
const USER_AGENT = config.userAgent || 'EVE Status Perception/1.1';
function base64url(buffer) {
return buffer
.toString('base64')
.replace(/\+/g, '-')
.replace(/\//g, '_')
.replace(/=+$/, '');
}
function generatePkce() {
const verifier = base64url(crypto.randomBytes(32));
const challenge = base64url(
crypto.createHash('sha256').update(verifier).digest()
);
return { verifier, challenge };
}
function assertConfig() {
if (!config.clientId || config.clientId.includes('PUT_YOUR_CLIENT_ID_HERE')) {
throw new Error('Open eve.js and set your EVE Online client ID.');
}
if (!config.redirectUri) {
throw new Error('eve.js is missing redirectUri.');
}
}
function waitForCallback(expectedState) {
assertConfig();
const redirectUrl = new URL(config.redirectUri);
const listenHost =
redirectUrl.hostname === 'localhost' ? '127.0.0.1' : redirectUrl.hostname;
const listenPort = Number(
redirectUrl.port || (redirectUrl.protocol === 'https:' ? 443 : 80)
);
return new Promise((resolve, reject) => {
let finished = false;
const finish = (fn, value) => {
if (finished) return;
finished = true;
try {
server.close();
} catch {
// ignore
}
fn(value);
};
const server = http.createServer((req, res) => {
const url = new URL(req.url || '/', config.redirectUri);
if (url.pathname !== redirectUrl.pathname) {
res.statusCode = 404;
res.end('Not found');
return;
}
const code = url.searchParams.get('code');
const state = url.searchParams.get('state');
const error = url.searchParams.get('error');
res.setHeader('Content-Type', 'text/plain');
res.end('EVE login complete. You can close this tab and return to the app.');
if (error) {
finish(reject, new Error(`EVE login error: ${error}`));
return;
}
if (!code || state !== expectedState) {
finish(reject, new Error('Invalid OAuth callback.'));
return;
}
finish(resolve, code);
});
server.on('error', (err) => {
finish(reject, err);
});
server.listen(listenPort, listenHost);
setTimeout(() => {
finish(reject, new Error('Login timed out.'));
}, 180000).unref();
});
}
async function exchangeCode(code, verifier) {
const body = new URLSearchParams({
grant_type: 'authorization_code',
client_id: config.clientId,
code,
redirect_uri: config.redirectUri,
code_verifier: verifier
});
const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
method: 'POST',
headers: {
'Content-Type': 'application/x-www-form-urlencoded',
'User-Agent': USER_AGENT
},
body
});
if (!res.ok) {
const text = await res.text();
throw new Error(`Token exchange failed: ${res.status} ${text}`);
}
const data = await res.json();
return {
accessToken: data.access_token,
refreshToken: data.refresh_token,
expiresAt: Date.now() + Number(data.expires_in || 1199) * 1000,
scopes: data.scope
};
}
async function refreshAccessToken(refreshToken) {
const body = new URLSearchParams({
grant_type: 'refresh_token',
client_id: config.clientId,
refresh_token: refreshToken
});
const res = await fetch('https://login.eveonline.com/v2/oauth/token', {
method: 'POST',
headers: {
'Content-Type': 'application/x-www-form-urlencoded',
'User-Agent': USER_AGENT
},
body
});
if (!res.ok) {
const text = await res.text();
throw new Error(`Token refresh failed: ${res.status} ${text}`);
}
const data = await res.json();
return {
accessToken: data.access_token,
refreshToken: data.refresh_token || refreshToken,
expiresAt: Date.now() + Number(data.expires_in || 1199) * 1000
};
}
async function getCharacterFromToken(accessToken) {
try {
const res = await fetch('https://login.eveonline.com/oauth/verify', {
headers: {
Authorization: `Bearer ${accessToken}`,
'User-Agent': USER_AGENT
}
});
if (res.ok) {
const data = await res.json();
if (data.CharacterID) {
return {
characterId: Number(data.CharacterID),
characterName: data.CharacterName || 'Unknown'
};
}
}
} catch {
// fall back to JWT decode
}
try {
const payloadPart = accessToken.split('.')[1];
const payload = JSON.parse(
Buffer.from(payloadPart, 'base64url').toString('utf8')
);
const characterId = Number(String(payload.sub || '').split(':').pop());
if (!characterId || Number.isNaN(characterId)) {
throw new Error('Could not parse character ID from token.');
}
return {
characterId,
characterName: payload.name || payload.character_name || 'Unknown'
};
} catch {
throw new Error('Could not identify character from token.');
}
}
async function startLogin(promptLogin = true) {
assertConfig();
const { verifier, challenge } = generatePkce();
const state = base64url(crypto.randomBytes(16));
const scopes = Array.isArray(config.scopes)
? config.scopes.join(' ')
: config.scopes;
const authUrl = new URL('https://login.eveonline.com/v2/oauth/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', config.clientId);
authUrl.searchParams.set('redirect_uri', config.redirectUri);
authUrl.searchParams.set('scope', scopes);
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', challenge);
authUrl.searchParams.set('code_challenge_method', 'S256');
if (promptLogin) {
authUrl.searchParams.set('prompt', 'login');
}
const codePromise = waitForCallback(state);
await shell.openExternal(authUrl.toString());
const code = await codePromise;
const tokens = await exchangeCode(code, verifier);
const character = await getCharacterFromToken(tokens.accessToken);
return { ...tokens, ...character };
}
async function esiFetch(path, accessToken) {
const res = await fetch(`${ESI_BASE}${path}`, {
headers: {
Authorization: `Bearer ${accessToken}`,
Accept: 'application/json',
'User-Agent': USER_AGENT,
'X-User-Agent': USER_AGENT
}
});
if (!res.ok) {
const err = new Error(`ESI ${path} failed: ${res.status}`);
err.status = res.status;
throw err;
}
return res.json();
}
async function publicFetch(path) {
const res = await fetch(`${ESI_BASE}${path}`, {
headers: {
Accept: 'application/json',
'User-Agent': USER_AGENT
}
});
if (!res.ok) {
const err = new Error(`ESI ${path} failed: ${res.status}`);
err.status = res.status;
throw err;
}
return res.json();
}
async function getWallet(characterId, accessToken) {
return esiFetch(`/characters/${characterId}/wallet/`, accessToken);
}
async function getSkillQueue(characterId, accessToken) {
return esiFetch(`/characters/${characterId}/skillqueue/`, accessToken);
}
async function getCharacterSkills(characterId, accessToken) {
return esiFetch(`/characters/${characterId}/skills/`, accessToken);
}
async function getCharacterLocation(characterId, accessToken) {
return esiFetch(`/characters/${characterId}/location/`, accessToken);
}
async function getCharacterShip(characterId, accessToken) {
return esiFetch(`/characters/${characterId}/ship/`, accessToken);
}
async function getTypeNames(ids) {
const unique = [...new Set(ids.filter(Boolean))];
if (unique.length === 0) return new Map();
const res = await fetch(`${ESI_BASE}/universe/names/`, {
method: 'POST',
headers: {
Accept: 'application/json',
'Content-Type': 'application/json',
'User-Agent': USER_AGENT
},
body: JSON.stringify(unique)
});
if (!res.ok) {
throw new Error(`Failed to resolve type names: ${res.status}`);
}
const arr = await res.json();
return new Map(arr.map((x) => [x.id, x.name]));
}
async function getSkillIdsFromNames(names) {
const unique = [...new Set(names.filter(Boolean))];
const map = new Map();
if (!unique.length) return map;
const res = await fetch(`${ESI_BASE}/universe/ids/`, {
method: 'POST',
headers: {
Accept: 'application/json',
'Content-Type': 'application/json',
'User-Agent': USER_AGENT
},
body: JSON.stringify(unique)
});
if (!res.ok) return map;
const data = await res.json();
const inventoryTypes = Array.isArray(data.inventory_types)
? data.inventory_types
: [];
for (const item of inventoryTypes) {
map.set(item.name, item.id);
}
return map;
}
function getActiveSkill(queue) {
const now = Date.now();
return (
queue.find((q) => {
const finish = new Date(q.finish_date).getTime();
const start = q.start_date ? new Date(q.start_date).getTime() : 0;
return finish > now && start <= now;
}) ||
queue.find(
(q) => q.queue_position === 0 && new Date(q.finish_date).getTime() > now
) ||
null
);
}
async function resolveLocationName(location, accessToken) {
if (!location) return null;
if (location.structure_id) {
try {
const structure = await esiFetch(
`/universe/structures/${location.structure_id}/`,
accessToken
);
if (structure && structure.name) return structure.name;
} catch {
// fall through
}
}
if (location.station_id) {
try {
const station = await publicFetch(
`/universe/stations/${location.station_id}/`
);
if (station && station.name) return station.name;
} catch {
// fall through
}
}
if (location.solar_system_id) {
try {
const system = await publicFetch(
`/universe/systems/${location.solar_system_id}/`
);
if (system && system.name) return system.name;
} catch {
return null;
}
}
return null;
}
const typeRankCache = new Map();
const typeRankInFlight = new Map();
function skillPointsAtLevel(rank, level) {
const safeRank = Number(rank) > 0 ? Number(rank) : 1;
const safeLevel = Number(level) || 0;
if (safeLevel <= 0) return 0;
return Math.round(250 * safeRank * Math.pow(Math.sqrt(32), safeLevel - 1));
}
function formatRefType(ref) {
return String(ref || '')
.split('_')
.map((part) => (!part ? '' : part.charAt(0).toUpperCase() + part.slice(1)))
.join(' ');
}
async function getSkillRank(skillId) {
if (typeRankCache.has(skillId)) return typeRankCache.get(skillId);
if (typeRankInFlight.has(skillId)) return typeRankInFlight.get(skillId);
const promise = (async () => {
try {
const res = await fetch(`${ESI_BASE}/universe/types/${skillId}/`, {
headers: {
Accept: 'application/json',
'User-Agent': USER_AGENT
}
});
if (!res.ok) return 1;
const data = await res.json();
const rankAttr = Array.isArray(data.dogma_attributes)
? data.dogma_attributes.find((attr) => attr.attribute_id === 275)
: null;
const rank = Number(rankAttr?.value);
const safeRank = Number.isFinite(rank) && rank > 0 ? rank : 1;
typeRankCache.set(skillId, safeRank);
return safeRank;
} catch {
return 1;
} finally {
typeRankInFlight.delete(skillId);
}
})();
typeRankInFlight.set(skillId, promise);
return promise;
}
async function enrichQueueWithSpCost(queue, skillsMap) {
const currentLevels = new Map();
const currentSkillPoints = new Map();
for (const skill of skillsMap.values()) {
currentLevels.set(skill.skill_id, Number(skill.current_skill_level || 0));
currentSkillPoints.set(skill.skill_id, Number(skill.skillpoints || 0));
}
let totalSpCost = 0;
const enriched = [];
for (const q of queue) {
const skillId = q.skill_id;
const toLevel = Number(q.finished_level || 0);
const fromLevel = currentLevels.get(skillId) || 0;
let spCost = null;
if (toLevel > fromLevel) {
const rank = await getSkillRank(skillId);
const targetSp = skillPointsAtLevel(rank, toLevel);
const baseSpForFromLevel = skillPointsAtLevel(rank, fromLevel);
const knownSp = Math.max(
currentSkillPoints.get(skillId) || 0,
baseSpForFromLevel
);
spCost = Math.max(0, Math.round(targetSp - knownSp));
totalSpCost += spCost;
currentLevels.set(skillId, toLevel);
currentSkillPoints.set(skillId, targetSp);
} else {
spCost = 0;
currentLevels.set(skillId, Math.max(fromLevel, toLevel));
}
enriched.push({ ...q, spCost });
}
return { queue: enriched, totalSpCost };
}
function getQueueTimes(queue) {
let totalDurationMs = 0;
let previousFinish = null;
let lastFinish = null;
for (const q of queue) {
const finish = q.finish_date ? new Date(q.finish_date).getTime() : null;
let start = q.start_date ? new Date(q.start_date).getTime() : null;
if (!start && previousFinish) start = previousFinish;
if (start && finish && finish > start) totalDurationMs += finish - start;
if (finish) {
previousFinish = finish;
if (!lastFinish || finish > lastFinish) lastFinish = finish;
}
}
const now = Date.now();
const remainingMs = lastFinish ? Math.max(0, lastFinish - now) : 0;
return { totalDurationMs, remainingMs, lastFinish };
}
async function getDashboard(characterId, accessToken) {
const [wallet, rawQueue] = await Promise.all([
getWallet(characterId, accessToken),
getSkillQueue(characterId, accessToken)
]);
let skills = null;
let location = null;
let ship = null;
try {
skills = await getCharacterSkills(characterId, accessToken);
} catch {
skills = null;
}
try {
location = await getCharacterLocation(characterId, accessToken);
} catch {
location = null;
}
try {
ship = await getCharacterShip(characterId, accessToken);
} catch {
ship = null;
}
const queueBase = Array.isArray(rawQueue) ? [...rawQueue] : [];
queueBase.sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
let names = new Map();
try {
names = await getTypeNames(queueBase.map((q) => q.skill_id));
} catch {
// ignore
}
const namedQueue = queueBase.map((q) => ({
...q,
skillName: names.get(q.skill_id) || `Unknown ${q.skill_id}`
}));
let enrichedQueue;
let totalSpCost = null;
if (skills && Array.isArray(skills.skills)) {
const skillsMap = new Map(
skills.skills.map((skill) => [skill.skill_id, skill])
);
const enriched = await enrichQueueWithSpCost(namedQueue, skillsMap);
enrichedQueue = enriched.queue;
totalSpCost = enriched.totalSpCost;
} else {
enrichedQueue = namedQueue.map((q) => ({ ...q, spCost: null }));
}
const active = getActiveSkill(enrichedQueue);
const nextSkill =
enrichedQueue.find((q) => q.queue_position === 1) ||
(!active ? enrichedQueue[0] || null : null);
const times = getQueueTimes(enrichedQueue);
const totalSp =
skills && typeof skills.total_sp === 'number' ? skills.total_sp : null;
const skillLevels = {};
if (skills && Array.isArray(skills.skills)) {
for (const skill of skills.skills) {
skillLevels[skill.skill_id] = Number(skill.current_skill_level || 0);
}
}
let locationName = null;
try {
locationName = await resolveLocationName(location, accessToken);
} catch {
locationName = null;
}
let shipType = null;
if (ship && ship.ship_type_id) {
try {
const typeNames = await getTypeNames([ship.ship_type_id]);
shipType = typeNames.get(ship.ship_type_id) || null;
} catch {
shipType = null;
}
}
return {
wallet: Number(wallet || 0),
active,
queue: enrichedQueue,
nextSkill,
totalSp,
queueTotalSpCost: totalSpCost,
queueTotalTimeMs: times.totalDurationMs,
queueRemainingMs: times.remainingMs,
skillLevels,
location: locationName,
shipName: ship?.ship_name || null,
shipType,
fetchedAt: new Date().toISOString()
};
}
async function fetchWalletJournal(characterId, accessToken, cutoffMs, maxPages = 5) {
let fromId = null;
const all = [];
for (let page = 0; page < maxPages; page++) {
const query = fromId ? `?from_id=${encodeURIComponent(fromId)}` : '';
const batch = await esiFetch(
`/characters/${characterId}/wallet/journal/${query}`,
accessToken
);
const entries = Array.isArray(batch) ? batch : [];
if (!entries.length) break;
entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const withinCutoff = entries.filter(
(entry) => new Date(entry.date).getTime() >= cutoffMs
);
all.push(...withinCutoff);
const oldest = entries[entries.length - 1];
if (!oldest || oldest.id == null) break;
const oldestTime = new Date(oldest.date).getTime();
if (oldestTime < cutoffMs) break;
fromId = oldest.id;
}
return all;
}
async function fetchWalletTransactions(characterId, accessToken, cutoffMs, maxPages = 5) {
let fromId = null;
const all = [];
for (let page = 0; page < maxPages; page++) {
const query = fromId ? `?from_id=${encodeURIComponent(fromId)}` : '';
const batch = await esiFetch(
`/characters/${characterId}/wallet/transactions/${query}`,
accessToken
);
const entries = Array.isArray(batch) ? batch : [];
if (!entries.length) break;
entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
const withinCutoff = entries.filter(
(entry) => new Date(entry.date).getTime() >= cutoffMs
);
all.push(...withinCutoff);
const oldest = entries[entries.length - 1];
if (!oldest || oldest.transaction_id == null) break;
const oldestTime = new Date(oldest.date).getTime();
if (oldestTime < cutoffMs) break;
fromId = oldest.transaction_id;
}
return all;
}
async function resolveNames(ids) {
const unique = [...new Set(ids.filter(Boolean))];
const map = new Map();
if (!unique.length) return map;
for (let i = 0; i < unique.length; i += 500) {
const chunk = unique.slice(i, i + 500);
try {
const res = await fetch(`${ESI_BASE}/universe/names/`, {
method: 'POST',
headers: {
Accept: 'application/json',
'Content-Type': 'application/json',
'User-Agent': USER_AGENT
},
body: JSON.stringify(chunk)
});
if (!res.ok) continue;
const arr = await res.json();
for (const item of arr) map.set(item.id, item.name);
} catch {
// ignore
}
}
return map;
}
async function getWalletDetails(characterId, accessToken, days = 7) {
const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
const [journal, transactions] = await Promise.all([
fetchWalletJournal(characterId, accessToken, cutoffMs),
fetchWalletTransactions(characterId, accessToken, cutoffMs)
]);
const ids = new Set();
for (const j of journal) {
if (j.first_party_id) ids.add(j.first_party_id);
if (j.second_party_id) ids.add(j.second_party_id);
if (j.context_id) ids.add(j.context_id);
if (j.tax_receiver_id) ids.add(j.tax_receiver_id);
}
for (const t of transactions) {
if (t.client_id) ids.add(t.client_id);
if (t.type_id) ids.add(t.type_id);
}
const names = await resolveNames([...ids]);
const journalEntries = journal.map((j) => {
const amount = Number(j.amount || 0);
return {
kind: 'journal',
id: j.id,
date: j.date,
amount,
balance: typeof j.balance === 'number' ? j.balance : null,
category: formatRefType(j.ref_type),
party:
names.get(j.second_party_id) ||
names.get(j.first_party_id) ||
names.get(j.context_id) ||
'',
description: j.description || j.reason || formatRefType(j.ref_type)
};
});
const transactionEntries = transactions.map((t) => {
const typeName = names.get(t.type_id) || `Type ${t.type_id}`;
const clientName = names.get(t.client_id) || `Character ${t.client_id}`;
const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);
const amount = t.is_buy ? -gross : gross;
return {
kind: 'transaction',
id: t.transaction_id,
date: t.date,
amount,
balance: null,
category: t.is_buy ? 'Buy' : 'Sell',
party: clientName,
description: `${t.is_buy ? 'Bought' : 'Sold'} ${t.quantity} × ${typeName}`,
quantity: Number(t.quantity || 0),
unitPrice: Number(t.unit_price || 0),
type: typeName,
isBuy: Boolean(t.is_buy)
};
});
const entries = [...journalEntries, ...transactionEntries].sort(
(a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
);
let moneyIn = 0;
let moneyOut = 0;
for (const entry of entries) {
const amount = Number(entry.amount || 0);
if (amount >= 0) moneyIn += amount;
else moneyOut += Math.abs(amount);
}
return {
entries,
summary: { count: entries.length, moneyIn, moneyOut, net: moneyIn - moneyOut },
fetchedAt: new Date().toISOString()
};
}
async function getRecentWalletEntries(characterId, accessToken) {
const [journal, transactions] = await Promise.all([
esiFetch(`/characters/${characterId}/wallet/journal/`, accessToken),
esiFetch(`/characters/${characterId}/wallet/transactions/`, accessToken)
]);
return {
journal: Array.isArray(journal) ? journal : [],
transactions: Array.isArray(transactions) ? transactions : []
};
}
module.exports = {
startLogin,
refreshAccessToken,
getDashboard,
getWalletDetails,
getSkillIdsFromNames,
getTypeNames,
resolveNames,
formatRefType,
getRecentWalletEntries
};
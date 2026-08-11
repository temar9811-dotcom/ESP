const {
app,
BrowserWindow,
ipcMain,
Tray,
Menu,
nativeImage,
clipboard
} = require('electron');
const path = require('path');
const fs = require('fs');
const storage = require('./storage');
const eve = require('./eve');
const { VERSION } = require('./version');
let win = null;
let tray = null;
let accounts = [];
let isQuitting = false;
let loginInProgress = false;
let refreshInProgress = false;
let walletCheckInProgress = false;
const walletBaseline = new Map();
const TRAY_ICON_DATA =
'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
function getTrayIcon() {
const assetPath = path.join(__dirname, 'assets', 'tray.png');
try {
if (fs.existsSync(assetPath)) {
return nativeImage.createFromPath(assetPath).resize({ width: 16, height: 16 });
}
} catch {
// Fall back
}
return nativeImage.createFromDataURL(TRAY_ICON_DATA).resize({ width: 16, height: 16 });
}
function showWindow() {
if (!win) {
createWindow();
return;
}
if (win.isMinimized()) {
win.restore();
}
win.show();
}
function createWindow() {
win = new BrowserWindow({
width: 1150,
height: 760,
show: false,
title: `EVE Status Perception v${VERSION}`,
autoHideMenuBar: true,
webPreferences: {
preload: path.join(__dirname, 'preload.js'),
contextIsolation: true,
nodeIntegration: false,
sandbox: false
}
});
win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
win.once('ready-to-show', () => {
win.show();
});
win.on('close', (e) => {
if (!isQuitting) {
e.preventDefault();
win.hide();
}
});
win.on('closed', () => {
win = null;
});
}
function createTray() {
if (tray) return;
tray = new Tray(getTrayIcon());
tray.setToolTip(`EVE Status Perception v${VERSION}\nNo characters added`);
const menu = Menu.buildFromTemplate([
{ label: 'Open', click: () => showWindow() },
{ label: 'Refresh now', click: () => { refreshAll().catch(console.error); } },
{ label: 'Add character', click: () => { addAccount().then(() => showWindow()).catch((err) => { console.error(err); showWindow(); }); } },
{ type: 'separator' },
{ label: 'Quit', click: () => { isQuitting = true; app.quit(); } }
]);
tray.setContextMenu(menu);
tray.on('double-click', () => { showWindow(); });
}
function getPublicAccounts() {
return accounts.map((account) => {
const { refreshTokenEnc, accessTokenEnc, ...safe } = account;
return safe;
});
}
function saveAccounts() {
storage.saveAccounts(accounts);
}
function updateTrayTooltip() {
if (!tray) return;
const header = `EVE Status Perception v${VERSION}`;
if (!accounts.length) {
tray.setToolTip(`${header}\nNo characters added`);
return;
}
const lines = accounts.slice(0, 3).map((account) => {
if (!account.activeSkill) {
return `${account.characterName || 'Character'}: idle`;
}
const remaining = remainingUntil(account.activeSkill.finish_date);
return `${account.characterName || 'Character'}: ${account.activeSkill.skillName || 'Unknown'} L${account.activeSkill.finished_level || '?'} (${remaining})`;
});
tray.setToolTip([header, ...lines].join('\n'));
}
function broadcastAccounts() {
saveAccounts();
const publicAccounts = getPublicAccounts();
if (win && !win.isDestroyed()) {
win.webContents.send('accounts-updated', publicAccounts);
}
updateTrayTooltip();
}
function remainingUntil(dateStr) {
if (!dateStr) return '';
const target = new Date(dateStr).getTime();
if (Number.isNaN(target)) return '';
const ms = target - Date.now();
if (ms <= 0) return 'complete';
const totalMinutes = Math.floor(ms / 60000);
const days = Math.floor(totalMinutes / 1440);
const hours = Math.floor((totalMinutes % 1440) / 60);
const minutes = totalMinutes % 60;
if (days > 0) return `${days}d ${hours}h ${minutes}m`;
if (hours > 0) return `${hours}h ${minutes}m`;
return `${minutes}m`;
}
function sendToRenderer(channel, payload) {
if (win && !win.isDestroyed()) {
win.webContents.send(channel, payload);
}
}
function checkSkillCompletion(account, dashboard) {
const currentActive = dashboard.active;
const now = Date.now();
if (account.lastSeenActiveSkill) {
const lastSkill = account.lastSeenActiveSkill;
const lastFinishTime = new Date(lastSkill.finish_date).getTime();
if (!Number.isNaN(lastFinishTime) && lastFinishTime <= now) {
const lastKey = `${lastSkill.skill_id}-${lastSkill.finished_level}-${lastSkill.finish_date}`;
const currentKey = currentActive
? `${currentActive.skill_id}-${currentActive.finished_level}-${currentActive.finish_date}`
: 'none';
if (lastKey !== currentKey) {
sendToRenderer('notification:skill-complete', {
characterName: account.characterName || 'Unknown',
skillName: lastSkill.skillName || 'Unknown skill',
level: lastSkill.finished_level || '?'
});
}
}
}
account.lastSeenActiveSkill = currentActive ? { ...currentActive } : null;
}
async function getValidAccessToken(account, force = false) {
const now = Date.now();
if (
!force &&
account.accessTokenEnc &&
account.accessTokenExpiresAt &&
account.accessTokenExpiresAt > now + 60000
) {
const token = storage.decryptSecret(account.accessTokenEnc);
if (token) return token;
}
const refreshToken = storage.decryptSecret(account.refreshTokenEnc);
if (!refreshToken) {
throw new Error('Missing refresh token. Remove and add this character again.');
}
const tokens = await eve.refreshAccessToken(refreshToken);
account.refreshTokenEnc = storage.encryptSecret(tokens.refreshToken);
account.accessTokenEnc = storage.encryptSecret(tokens.accessToken);
account.accessTokenExpiresAt = tokens.expiresAt;
account.lastError = null;
saveAccounts();
return tokens.accessToken;
}
function applyDashboard(account, dashboard) {
account.wallet = dashboard.wallet;
account.activeSkill = dashboard.active;
account.queue = dashboard.queue;
account.nextSkill = dashboard.nextSkill || null;
account.totalSp = dashboard.totalSp ?? null;
account.queueTotalSpCost = dashboard.queueTotalSpCost ?? null;
account.queueTotalTimeMs = dashboard.queueTotalTimeMs ?? 0;
account.queueRemainingMs = dashboard.queueRemainingMs ?? 0;
account.skillLevels = dashboard.skillLevels || {};
account.location = dashboard.location || null;
account.shipName = dashboard.shipName || null;
account.shipType = dashboard.shipType || null;
account.lastFetchedAt = dashboard.fetchedAt;
account.lastError = null;
}
async function refreshCharacter(account) {
try {
let token = await getValidAccessToken(account, false);
try {
const dashboard = await eve.getDashboard(account.characterId, token);
applyDashboard(account, dashboard);
checkSkillCompletion(account, dashboard);
} catch (err) {
if (err && err.status === 401) {
token = await getValidAccessToken(account, true);
const dashboard = await eve.getDashboard(account.characterId, token);
applyDashboard(account, dashboard);
checkSkillCompletion(account, dashboard);
} else {
throw err;
}
}
} catch (err) {
account.lastError = err?.message || String(err);
}
}
async function refreshAll() {
if (refreshInProgress) return;
refreshInProgress = true;
try {
await Promise.allSettled(accounts.map((account) => refreshCharacter(account)));
broadcastAccounts();
} finally {
refreshInProgress = false;
}
}
async function checkWalletActivity() {
if (walletCheckInProgress) return;
walletCheckInProgress = true;
try {
for (const account of accounts) {
try {
const token = await getValidAccessToken(account, false);
const recent = await eve.getRecentWalletEntries(account.characterId, token);
const currentIds = new Set();
const entries = [];
for (const j of recent.journal) {
currentIds.add(`j-${j.id}`);
entries.push({
kind: 'journal',
id: j.id,
date: j.date,
amount: Number(j.amount || 0),
description: j.description || j.reason || 'Journal entry'
});
}
for (const t of recent.transactions) {
currentIds.add(`t-${t.transaction_id}`);
const gross = Number(t.unit_price || 0) * Number(t.quantity || 0);
entries.push({
kind: 'transaction',
id: t.transaction_id,
date: t.date,
amount: t.is_buy ? -gross : gross,
description: `${t.is_buy ? 'Bought' : 'Sold'} ${t.quantity} x ${t.type_id}`
});
}
const key = account.characterId;
if (!walletBaseline.has(key)) {
walletBaseline.set(key, currentIds);
continue;
}
const base = walletBaseline.get(key);
const fresh = entries.filter((e) => {
const eid = e.kind === 'journal' ? `j-${e.id}` : `t-${e.id}`;
return !base.has(eid);
});
if (fresh.length) {
sendToRenderer('notification:wallet-activity', {
characterName: account.characterName || 'Unknown',
entries: fresh.slice(0, 5)
});
}
walletBaseline.set(key, currentIds);
} catch (err) {
// ignore per-character wallet errors
}
}
} finally {
walletCheckInProgress = false;
}
}
async function addAccount() {
if (loginInProgress) throw new Error('Login already in progress.');
loginInProgress = true;
try {
const login = await eve.startLogin(true);
let account = accounts.find((a) => Number(a.characterId) === Number(login.characterId));
if (!account) {
account = { characterId: Number(login.characterId), addedAt: new Date().toISOString() };
accounts.push(account);
}
account.characterName = login.characterName;
account.refreshTokenEnc = storage.encryptSecret(login.refreshToken);
account.accessTokenEnc = storage.encryptSecret(login.accessToken);
account.accessTokenExpiresAt = login.expiresAt;
account.scopes = login.scopes;
account.lastError = null;
await refreshCharacter(account);
broadcastAccounts();
return getPublicAccounts();
} finally {
loginInProgress = false;
}
}
function removeAccount(characterId) {
accounts = accounts.filter((account) => Number(account.characterId) !== Number(characterId));
broadcastAccounts();
}
function getPlansFile() {
return path.join(app.getPath('userData'), 'skillPlans.json');
}
function loadPlans() {
try {
const raw = fs.readFileSync(getPlansFile(), 'utf8');
const data = JSON.parse(raw);
return Array.isArray(data) ? data : [];
} catch {
return [];
}
}
function savePlansFile(plans) {
const file = getPlansFile();
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(plans, null, 2), 'utf8');
}
function parseClipboardPlan(text) {
const lines = String(text || '').split(/\r?\n/);
const entries = [];
const errors = [];
lines.forEach((rawLine, index) => {
const line = rawLine.trim();
if (!line) return;
const match = line.match(/^(.+?)\s+(\d{1,2})$/);
if (!match) {
errors.push(`Line ${index + 1}: could not parse "${line}".`);
return;
}
const name = match[1].trim();
const level = Number(match[2]);
if (!Number.isInteger(level) || level < 1 || level > 5) {
errors.push(`Line ${index + 1}: invalid level "${match[2]}".`);
return;
}
entries.push({ name, level });
});
return { entries, errors };
}
async function resolvePlanEntries(entries) {
const names = [...new Set(entries.map((entry) => entry.name))];
let idsMap = new Map();
try {
idsMap = await eve.getSkillIdsFromNames(names);
} catch {
idsMap = new Map();
}
return entries.map((entry) => ({
name: entry.name,
level: entry.level,
skillId: idsMap.get(entry.name) || null
}));
}
let testHarness = null;
function registerIpcHandlers() {
ipcMain.handle('app:getVersion', () => VERSION);
ipcMain.handle('accounts:list', () => getPublicAccounts());
ipcMain.handle('accounts:add', async () => addAccount());
ipcMain.handle('accounts:remove', async (_event, characterId) => {
removeAccount(characterId);
return getPublicAccounts();
});
ipcMain.handle('accounts:refresh', async () => {
await refreshAll();
return getPublicAccounts();
});
ipcMain.handle('accounts:getWalletDetails', async (_event, characterId) => {
const account = accounts.find((a) => Number(a.characterId) === Number(characterId));
if (!account) throw new Error('Character not found.');
try {
let token = await getValidAccessToken(account, false);
try {
return await eve.getWalletDetails(account.characterId, token, 7);
} catch (err) {
if (err && err.status === 401) {
token = await getValidAccessToken(account, true);
return await eve.getWalletDetails(account.characterId, token, 7);
}
throw err;
}
} catch (err) {
throw new Error(err?.message || String(err));
}
});
ipcMain.handle('plans:readClipboard', async () => {
const text = clipboard.readText();
const parsed = parseClipboardPlan(text);
if (!parsed.entries.length) throw new Error('No valid skill lines found in the clipboard.');
const entries = await resolvePlanEntries(parsed.entries);
return { entries, errors: parsed.errors };
});
ipcMain.handle('plans:list', () => loadPlans());
ipcMain.handle('plans:save', async (_event, payload) => {
const plans = loadPlans();
const name = String(payload?.name || '').trim();
const entries = Array.isArray(payload?.entries) ? payload.entries : [];
const scope = payload?.scope === 'character' ? 'character' : 'global';
const characterId = scope === 'character' ? Number(payload?.characterId) : null;
if (!name) throw new Error('Plan name is required.');
if (!entries.length) throw new Error('Plan has no skills.');
if (scope === 'character' && !Number.isInteger(characterId)) throw new Error('Select a character for this plan.');
const plan = {
id: `plan-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
name,
scope,
characterId,
createdAt: new Date().toISOString(),
entries: entries.map((entry) => ({
name: String(entry.name || ''),
level: Number(entry.level || 1),
skillId: entry.skillId ? Number(entry.skillId) : null
}))
};
plans.push(plan);
savePlansFile(plans);
return plan;
});
ipcMain.handle('plans:delete', async (_event, planId) => {
let plans = loadPlans();
plans = plans.filter((plan) => plan.id !== planId);
savePlansFile(plans);
return true;
});
ipcMain.handle('test:run', async (_event, command, payload) => {
if (!testHarness) return { ok: false, error: 'Test harness not installed.' };
return testHarness.run(command, payload);
});
ipcMain.handle('test:enabled', () => {
return testHarness ? testHarness.testEnabled() : false;
});
}
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
app.quit();
} else {
app.on('second-instance', () => showWindow());
app.whenReady().then(async () => {
app.setAppUserModelId('com.esp.app');
accounts = storage.loadAccounts();
try {
testHarness = require('./test/test-main.js');
testHarness.init({
getWindow: () => win,
getAccounts: () => accounts,
refreshAll,
showWindow
});
} catch (err) {
testHarness = null;
}
registerIpcHandlers();
createWindow();
createTray();
await refreshAll();
setInterval(() => { refreshAll().catch(console.error); }, 60000);
setInterval(() => { checkWalletActivity().catch(console.error); }, 120000);
});
}
app.on('before-quit', () => { isQuitting = true; });
app.on('window-all-closed', () => {
// Keep running in tray.
});
// ============================================================
// EVE Status Perception - test harness (main-process side)
// Safe to edit freely. Every command is a no-op unless
// test/test-mode.json has enabled:true.
// ============================================================
const fs = require('fs');
const path = require('path');
let api = null;
function modeFile() {
return path.join(__dirname, 'test-mode.json');
}
function testEnabled() {
try {
const data = JSON.parse(fs.readFileSync(modeFile(), 'utf8'));
return data.enabled === true;
} catch (err) {
return false;
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
return accounts.map((a) => ({
characterId: a.characterId,
characterName: a.characterName || 'Unknown',
wallet: a.wallet ?? null,
location: a.location || null,
shipName: a.shipName || null,
shipType: a.shipType || null,
activeSkill: a.activeSkill
? {
skillName: a.activeSkill.skillName,
level: a.activeSkill.finished_level,
finish: a.activeSkill.finish_date
}
: null
}));
}
async function run(command, payload) {
if (!testEnabled()) {
return {
ok: false,
error: 'Test mode is disabled. Set enabled:true in test/test-mode.json.'
};
}
try {
switch (command) {
case 'ping':
return { ok: true, result: 'pong' };
case 'bubble.skill':
sendToRenderer('notification:skill-complete', {
characterName: (payload && payload.characterName) || 'Test Character',
skillName: (payload && payload.skillName) || 'Test Skill',
level: (payload && payload.level) || 5
});
return { ok: true };
case 'bubble.wallet':
sendToRenderer('notification:wallet-activity', {
characterName: (payload && payload.characterName) || 'Test Character',
entries: [
{
description: (payload && payload.description) || 'Test transaction',
amount: payload && payload.amount != null ? payload.amount : 1000000
}
]
});
return { ok: true };
case 'accounts.summary':
return { ok: true, result: listAccountsSafe() };
case 'app.refresh':
if (api && api.refreshAll) {
await api.refreshAll();
return { ok: true };
}
return { ok: false, error: 'refreshAll not available.' };
case 'app.showWindow':
if (api && api.showWindow) {
api.showWindow();
return { ok: true };
}
return { ok: false, error: 'showWindow not available.' };
default:
return { ok: false, error: 'Unknown test command: ' + command };
}
} catch (err) {
return { ok: false, error: (err && err.message) || String(err) };
}
}
function init(injectedApi) {
api = injectedApi || null;
}
module.exports = { init, run, testEnabled };
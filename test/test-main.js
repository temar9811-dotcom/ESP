'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const storage = require('../storage');

let api = null;

function loadRegistries() {
  return [
    require('./test-cmds-core'), require('./test-cmds-bubbles'),
    require('./test-cmds-roundtrip'), require('./test-cmds-data'),
    require('./test-cmds-debug'), require('./test-cmds-assets'),
    require('./test-cmds-assets-diag'), require('./test-cmds-assets-audit'),
    require('./test-pilots')
  ];
}

function modeFile() { return path.join(__dirname, 'test-mode.json'); }

function testEnabled() {
  try { return JSON.parse(fs.readFileSync(modeFile(), 'utf8')).enabled === true; }
  catch { return false; }
}

function setTestEnabled(value) {
  try {
    fs.writeFileSync(modeFile(), JSON.stringify({ enabled: Boolean(value), note: 'Set enabled to false to turn off.' }, null, 2), 'utf8');
  } catch {}
}

function sendToRenderer(channel, payload) {
  const win = api && api.getWindow ? api.getWindow() : null;
  if (win && !win.isDestroyed()) { win.webContents.send(channel, payload); return true; }
  return false;
}

function listAccountsSafe() {
  const accounts = api && api.getAccounts ? api.getAccounts() : [];
  return accounts.map((a) => ({
    characterId: a.characterId, characterName: a.characterName || 'Unknown',
    wallet: a.wallet ?? null, location: a.location || null,
    shipName: a.shipName || null, shipType: a.shipType || null,
    activeSkill: a.activeSkill ? { skillName: a.activeSkill.skillName, level: a.activeSkill.finished_level, finish: a.activeSkill.finish_date } : null
  }));
}

function readLegacyAccounts() {
  const importer = require('../main/importer');
  const legacyDir = importer.findLegacyUserData();
  if (!legacyDir) return { legacyDir: null, legacyAccounts: [] };
  try {
    const raw = fs.readFileSync(path.join(legacyDir, 'accounts.json'), 'utf8');
    return { legacyDir, legacyAccounts: Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [] };
  } catch { return { legacyDir, legacyAccounts: [] }; }
}

async function run(command, payload) {
  if (!testEnabled()) return { ok: false, error: 'Test mode is disabled.' };
  try {
    const safePayload = payload && typeof payload === 'object' ? payload : {};
    const ctx = { api, storage, app, listAccountsSafe, readLegacyAccounts, setTestEnabled, sendToRenderer };
    for (const registry of loadRegistries()) {
      const handler = registry[command];
      if (typeof handler === 'function') return await handler(safePayload, ctx);
    }
    return { ok: false, error: `Unknown test command: ${command}` };
  } catch (err) { return { ok: false, error: (err && err.message) || String(err) }; }
}

function init(injectedApi) { api = injectedApi || null; }

module.exports = { init, run, testEnabled };
'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const storage = require('../storage');

let api = null;

function loadRegistries() {
  return [
    require('./test-cmds-core'),
    require('./test-cmds-bubbles'),
    require('./test-cmds-roundtrip'),
    require('./test-cmds-data'),
    require('./test-cmds-debug'),
    require('./test-cmds-assets'),
    require('./test-cmds-assets-diag'),
    require('./test-cmds-assets-audit')
  ];
}

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
      JSON.stringify(
        {
          enabled: Boolean(value),
          note: 'Set enabled to false, or delete this file, to turn the test harness off. No app restart needed.'
        },
        null,
        2
      ),
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
    const safePayload =
      payload && typeof payload === 'object' ? payload : {};

    const ctx = {
      api,
      storage,
      app,
      listAccountsSafe,
      readLegacyAccounts,
      setTestEnabled,
      sendToRenderer
    };

    for (const registry of loadRegistries()) {
      const handler = registry[command];
      if (typeof handler === 'function') {
        return await handler(safePayload, ctx);
      }
    }

    return { ok: false, error: `Unknown test command: ${command}` };
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
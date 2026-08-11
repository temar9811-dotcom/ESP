'use strict';

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
  } catch {
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

      case 'bubble.skill': {
        sendToRenderer('notification:skill-complete', {
          characterName: safePayload.characterName || 'Test Character',
          skillName: safePayload.skillName || 'Test Skill',
          level: safePayload.level ?? 5
        });

        return { ok: true };
      }

      case 'bubble.wallet': {
        const rawAmount = safePayload.amount;
        const parsedAmount = Number(rawAmount);
        const amount =
          rawAmount == null || !Number.isFinite(parsedAmount)
            ? 1000000
            : parsedAmount;

        sendToRenderer('notification:wallet-activity', {
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
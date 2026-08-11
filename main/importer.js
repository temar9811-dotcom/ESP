'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const storage = require('../storage');
const accounts = require('./accounts');
const plans = require('./plans');

const LEGACY_APP_NAMES = ['EVE Skill Tray'];

function findLegacyUserData() {
  const appData = app.getPath('appData');

  for (const name of LEGACY_APP_NAMES) {
    const dir = path.join(appData, name);
    const accountsFile = path.join(dir, 'accounts.json');

    try {
      if (fs.existsSync(accountsFile)) {
        return dir;
      }
    } catch {
      // Ignore lookup errors.
    }
  }

  return null;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function reencrypt(value) {
  if (!value) return '';
  return storage.encryptSecret(storage.decryptSecret(value));
}

function importLegacy() {
  const legacyDir = findLegacyUserData();

  if (!legacyDir) {
    return {
      ok: false,
      error: 'No EVE Skill Tray data found on this computer.'
    };
  }

  const legacyAccounts = readJson(path.join(legacyDir, 'accounts.json'));
  const legacyPlans = readJson(path.join(legacyDir, 'skillPlans.json'));

  const existing = accounts.getAccounts();
  const existingIds = new Set(
    existing.map((account) => Number(account.characterId))
  );

  let importedAccounts = 0;
  let skippedAccounts = 0;

  for (const old of Array.isArray(legacyAccounts) ? legacyAccounts : []) {
    const characterId = Number(old.characterId);

    if (!characterId || existingIds.has(characterId)) {
      skippedAccounts += 1;
      continue;
    }

    existing.push({
      characterId,
      characterName: old.characterName || `Character ${characterId}`,
      addedAt: old.addedAt || new Date().toISOString(),
      importedFrom: 'EVE Skill Tray',
      scopes: old.scopes || null,
      refreshTokenEnc: reencrypt(old.refreshTokenEnc),
      accessTokenEnc: reencrypt(old.accessTokenEnc),
      accessTokenExpiresAt: 0,
      lastError: null
    });

    existingIds.add(characterId);
    importedAccounts += 1;
  }

  const importedPlans =
    typeof plans.mergePlans === 'function'
      ? plans.mergePlans(Array.isArray(legacyPlans) ? legacyPlans : [])
      : 0;

  return {
    ok: true,
    importedAccounts,
    skippedAccounts,
    importedPlans
  };
}

module.exports = {
  importLegacy,
  findLegacyUserData
};
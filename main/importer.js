'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const storage = require('../storage');
const accounts = require('./accounts');
const plans = require('./plans');
const eve = require('../eve');

const LEGACY_FOLDER_CANDIDATES = [
  'EVE Skill Tray',
  'eve-skill-tray',
  'EVE SkillTray',
  'eve-skilltray',
  'eve_skill_tray'
];

const EXPORT_FILE_NAME = 'esp-migration-export.json';

function hasLegacyAccountsFile(dir) {
  const file = path.join(dir, 'accounts.json');

  try {
    if (!fs.existsSync(file)) {
      return false;
    }

    const raw = fs.readFileSync(file, 'utf8');
    return raw.includes('refreshTokenEnc');
  } catch {
    return false;
  }
}

function findLegacyUserData() {
  const appData = app.getPath('appData');

  for (const name of LEGACY_FOLDER_CANDIDATES) {
    const dir = path.join(appData, name);

    if (hasLegacyAccountsFile(dir)) {
      return dir;
    }
  }

  try {
    const entries = fs.readdirSync(appData, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/eve|skill|tray/i.test(entry.name)) continue;

      const dir = path.join(appData, entry.name);

      if (hasLegacyAccountsFile(dir)) {
        return dir;
      }
    }
  } catch {
    // Ignore scan errors.
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

function isPrintable(value) {
  return (
    typeof value === 'string' && value.length > 0 && /^[ -~]+$/.test(value)
  );
}

function decryptLegacy(value) {
  if (!value) return null;

  const plain = storage.decryptSecret(value);
  return isPrintable(plain) ? plain : null;
}
async function importFromExport(exportData) {
  const existing = accounts.getAccounts();
  const stats = { imported: 0, updated: 0, skipped: 0 };

  for (const entry of Array.isArray(exportData.accounts) ? exportData.accounts : []) {
    const characterId = Number(entry.characterId);
    const refreshToken =
      typeof entry.refreshToken === 'string' ? entry.refreshToken : '';

    if (!characterId || !isPrintable(refreshToken)) {
      stats.skipped += 1;
      continue;
    }

    // Verify the token live and rotate it into ESP in one move.
    let tokens = null;

    try {
      tokens = await eve.refreshAccessToken(refreshToken);
    } catch {
      tokens = null;
    }

    if (!tokens) {
      stats.skipped += 1;
      continue;
    }

    const existingAccount = existing.find(
      (account) => Number(account.characterId) === characterId
    );

    if (existingAccount) {
      existingAccount.refreshTokenEnc = storage.encryptSecret(tokens.refreshToken);
      existingAccount.accessTokenEnc = storage.encryptSecret(tokens.accessToken);
      existingAccount.accessTokenExpiresAt = tokens.expiresAt;
      existingAccount.lastError = null;

      if (entry.characterName) {
        existingAccount.characterName = entry.characterName;
      }

      stats.updated += 1;
      continue;
    }

    existing.push({
      characterId,
      characterName: entry.characterName || `Character ${characterId}`,
      addedAt: entry.addedAt || new Date().toISOString(),
      importedFrom: 'EVE Skill Tray',
      scopes: entry.scopes || null,
      refreshTokenEnc: storage.encryptSecret(tokens.refreshToken),
      accessTokenEnc: storage.encryptSecret(tokens.accessToken),
      accessTokenExpiresAt: tokens.expiresAt,
      lastError: null
    });

    stats.imported += 1;
  }

  const importedPlans = plans.mergePlans(
    Array.isArray(exportData.plans) ? exportData.plans : []
  );

  return { stats, importedPlans };
}

function importFromAccountsFile(legacyDir) {
  const legacyAccounts = readJson(path.join(legacyDir, 'accounts.json'));
  const existing = accounts.getAccounts();
  const stats = { imported: 0, updated: 0, skipped: 0 };

  for (const old of Array.isArray(legacyAccounts) ? legacyAccounts : []) {
    const characterId = Number(old.characterId);
    const refreshToken = decryptLegacy(old.refreshTokenEnc);

    if (!characterId || !refreshToken) {
      stats.skipped += 1;
      continue;
    }

    const existingAccount = existing.find(
      (account) => Number(account.characterId) === characterId
    );

    if (existingAccount) {
      // Conservative fallback: only repair characters already broken.
      if (existingAccount.lastError) {
        existingAccount.refreshTokenEnc = storage.encryptSecret(refreshToken);
        existingAccount.accessTokenEnc = storage.encryptSecret(
          decryptLegacy(old.accessTokenEnc) || ''
        );
        existingAccount.accessTokenExpiresAt = 0;
        existingAccount.lastError = null;
        stats.updated += 1;
      } else {
        stats.skipped += 1;
      }
      continue;
    }

    existing.push({
      characterId,
      characterName: old.characterName || `Character ${characterId}`,
      addedAt: old.addedAt || new Date().toISOString(),
      importedFrom: 'EVE Skill Tray',
      scopes: old.scopes || null,
      refreshTokenEnc: storage.encryptSecret(refreshToken),
      accessTokenEnc: storage.encryptSecret(decryptLegacy(old.accessTokenEnc) || ''),
      accessTokenExpiresAt: 0,
      lastError: null
    });

    stats.imported += 1;
  }

  const legacyPlans = readJson(path.join(legacyDir, 'skillPlans.json'));
  const importedPlans = plans.mergePlans(
    Array.isArray(legacyPlans) ? legacyPlans : []
  );

  return { stats, importedPlans };
}

async function importLegacy() {
  const legacyDir = findLegacyUserData();

  if (!legacyDir) {
    return {
      ok: false,
      error: 'No EVE Skill Tray data found on this computer.'
    };
  }

  const exportFile = path.join(legacyDir, EXPORT_FILE_NAME);
  const exportData = readJson(exportFile);

  let source;
  let outcome;

  if (exportData && Array.isArray(exportData.accounts)) {
    source = 'export';
    outcome = await importFromExport(exportData);

    // Remove the plaintext export once consumed.
    try {
      fs.unlinkSync(exportFile);
    } catch {
      // Ignore cleanup errors.
    }
  } else {
    source = 'accounts-file';
    outcome = importFromAccountsFile(legacyDir);
  }

  const { stats, importedPlans } = outcome;

  if (stats.imported > 0 || stats.updated > 0) {
    accounts.refreshAll().catch(() => {
      // Ignore background refresh errors after import.
    });
  }

  return {
    ok: true,
    legacyDir,
    source,
    importedAccounts: stats.imported + stats.updated,
    repairedAccounts: stats.updated,
    skippedAccounts: stats.skipped,
    importedPlans
  };
}

module.exports = {
  importLegacy,
  findLegacyUserData
};
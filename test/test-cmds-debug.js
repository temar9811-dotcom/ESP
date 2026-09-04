'use strict';

// Debug / migration / overlay test commands.

module.exports = {
  'debug.legacy': async (payload, ctx) => {
    const accountsMod = require('../main/accounts');
    const { legacyDir, legacyAccounts } = ctx.readLegacyAccounts();
    if (!legacyDir) {
      return { ok: true, result: { legacyDir: null } };
    }
    const espAccounts = accountsMod.getAccounts();
    const rows = legacyAccounts.map((old) => {
      const decrypted = ctx.storage.decryptSecret(old.refreshTokenEnc);
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
  },

  'debug.legacyMigrate': async (payload, ctx) => {
    const accountsMod = require('../main/accounts');
    const eve = require('../eve');
    const { legacyDir, legacyAccounts } = ctx.readLegacyAccounts();
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
      const plaintext = ctx.storage.decryptSecret(old.refreshTokenEnc);
      try {
        const tokens = await eve.refreshAccessToken(plaintext);
        esp.refreshTokenEnc = ctx.storage.encryptSecret(tokens.refreshToken);
        esp.accessTokenEnc = ctx.storage.encryptSecret(tokens.accessToken);
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
  },

  'debug.toastdev': async () => {
    const { BrowserWindow } = require('electron');
    const overlay = BrowserWindow.getAllWindows().find((w) =>
      (w.webContents.getURL() || '').includes('toast.html')
    );
    if (!overlay) {
      return { ok: false, error: 'Overlay window not found.' };
    }
    overlay.webContents.openDevTools({ mode: 'detach' });
    return { ok: true };
  },

  'debug.toastping': async () => {
    const toastWindow = require('../main/toast-window');
    toastWindow.showToast('Main ping', 'Direct from main process');
    return { ok: true };
  },

  'history.inject': async (payload) => {
    const skillHistory = require('../main/skill-history');
    const accountsMod = require('../main/accounts');
    const target =
      accountsMod
        .getAccounts()
        .find((a) => Number(a.characterId) === Number(payload.characterId)) ||
      accountsMod.getAccounts()[0];
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
      skillHistory.recordCompletion(target.characterId, { ...s, test: true });
    }
    target.recentCompletions = skillHistory.getRecent(target.characterId, 7);
    accountsMod.broadcastAccounts();
    setTimeout(() => {
      skillHistory.removeTestEntries(target.characterId);
      target.recentCompletions = skillHistory.getRecent(target.characterId, 7);
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
};
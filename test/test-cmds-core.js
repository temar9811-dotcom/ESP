'use strict';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

// Core app/test commands: ping, version, refresh, window, login,
// groups, accounts summary, token export, test-mode toggle, test pilots.

module.exports = {
  'ping': async () => {
    return { ok: true, result: 'pong' };
  },

  'app.version': async () => {
    const { VERSION } = require('../version');
    return { ok: true, result: VERSION };
  },

  'accounts.summary': async (payload, ctx) => {
    return { ok: true, result: ctx.listAccountsSafe() };
  },

  'app.refresh': async (payload, ctx) => {
    if (ctx.api && ctx.api.refreshAll) {
      await ctx.api.refreshAll();
      return { ok: true };
    }
    return { ok: false, error: 'refreshAll not available.' };
  },

  'app.showWindow': async (payload, ctx) => {
    if (ctx.api && ctx.api.showWindow) {
      ctx.api.showWindow();
      return { ok: true };
    }
    return { ok: false, error: 'showWindow not available.' };
  },

  'login.cancelIdle': async () => {
    const accountsMod = require('../main/accounts');
    accountsMod.cancelLogin();
    return { ok: true, result: 'cancelLogin() ran with no pending login.' };
  },

  'groups.read': async () => {
    const groups = require('../main/groups');
    const groupMap = await groups.getGroups();
    return { ok: true, result: Object.keys(groupMap || {}) };
  },

  'test:disable': async (payload, ctx) => {
    ctx.setTestEnabled(false);
    return { ok: true, result: { testMode: false } };
  },

  'accounts.exportTokens': async () => {
    const accountsMod = require('../main/accounts');
    const storage = require('../storage');
    const out = [];
    for (const account of accountsMod.getAccounts()) {
      let accessToken = null;
      try {
        accessToken = await accountsMod.getValidAccessToken(account, false);
      } catch {
        accessToken = storage.decryptSecret(account.accessTokenEnc) || null;
      }
      out.push({
        characterId: Number(account.characterId),
        characterName: account.characterName || null,
        refreshToken: storage.decryptSecret(account.refreshTokenEnc) || null,
        accessToken,
        expiresAt: account.accessTokenExpiresAt || null,
        scopes: Array.isArray(account.scopes)
          ? account.scopes.join(' ')
          : account.scopes || ''
      });
    }
    const file = path.join(app.getPath('userData'), 'token-export.json');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2), 'utf8');
    return { ok: true, result: { exported: out.length, file } };
  },

  'testpilots.add': async () => {
    const pilots = require('./test-pilots');
    return { ok: true, result: pilots.addPilots() };
  },

  'testpilots.remove': async () => {
    const pilots = require('./test-pilots');
    return { ok: true, result: pilots.removePilots() };
  }
};
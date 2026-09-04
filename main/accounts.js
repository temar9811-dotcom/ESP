'use strict';
const storage = require('../storage');
const eve = require('../eve');
const sso = require('../eve/sso');
const skillHistory = require('./skill-history');
const notesStore = require('./notes');
const eveConfig = require('../eve/config');
const refreshModule = require('./accounts-refresh');

let accounts = [];
let loginInProgress = false;
let refreshInProgress = false;
let rateLimitedUntil = 0;
let callbacks = {
  onBroadcast: () => {}, onSkillCompleted: () => {},
  onQueueWarning: () => {}, onQueueEmpty: () => {},
  onRefreshState: () => {}, onAccountRemoved: () => {}
};

function init(newCallbacks) { callbacks = { ...callbacks, ...(newCallbacks || {}) }; }

function scopesFromAccessToken(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length < 2) return null;
    const padded = parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=');
    const payload = JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    if (Array.isArray(payload.scp)) return payload.scp;
    if (typeof payload.scp === 'string') return [payload.scp];
    return null;
  } catch { return null; }
}

function ensureScopes(account) {
  if (!account) return [];
  if (account.scopes != null) return account.scopes;
  const token = storage.decryptSecret(account.accessTokenEnc);
  const scopes = scopesFromAccessToken(token);
  if (scopes) { account.scopes = scopes; saveAccounts(); }
  return account.scopes;
}

function loadAccounts() {
  accounts = storage.loadAccounts();
  let backfilled = false;
  for (const account of accounts) {
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
    account.notes = notesStore.getNote(account.characterId);
    if (account.scopes == null) {
      const token = storage.decryptSecret(account.accessTokenEnc);
      const scopes = scopesFromAccessToken(token);
      if (scopes) { account.scopes = scopes; backfilled = true; }
    }
  }
  if (backfilled) saveAccounts();
}

function getAccounts() { return accounts; }
function getPublicAccounts() { return accounts.map(({ refreshTokenEnc, accessTokenEnc, ...safe }) => safe); }
function emitRefreshState() { callbacks.onRefreshState({ refreshing: refreshInProgress, rateLimitedUntil }); }

// Getters/setters required by accounts-refresh.js
function isRefreshing() { return refreshInProgress; }
function setRefreshing(val) { refreshInProgress = val; }
function getRateLimitedUntil() { return rateLimitedUntil; }
function setRateLimitedUntil(val) { rateLimitedUntil = val; }
function emitSkillCompleted(payload) { callbacks.onSkillCompleted(payload); }
function emitQueueEmpty(payload) { callbacks.onQueueEmpty(payload); }
function emitQueueWarning(payload) { callbacks.onQueueWarning(payload); }

function enterRateLimit(seconds) {
  const cooldown = Math.max(5, Number(seconds) || 60);
  const until = Date.now() + cooldown * 1000;
  if (until > rateLimitedUntil) {
    rateLimitedUntil = until;
    console.warn(`[ESI] rate limited — cooling down ${cooldown}s`);
    emitRefreshState();
  }
}

async function waitErrorBudget() {
  const { getErrorLimitState } = require('../eve/http');
  const { remain, resetAt } = getErrorLimitState();
  if (remain != null && remain <= 10 && resetAt && resetAt > Date.now()) {
    const waitMs = Math.min(resetAt - Date.now(), 60000);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }
}
async function waitRateLimit() {
  const waitMs = rateLimitedUntil - Date.now();
  if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
}

function saveAccounts() { storage.saveAccounts(accounts); }
function broadcastAccounts() { saveAccounts(); callbacks.onBroadcast(getPublicAccounts()); }

async function getValidAccessToken(account, force = false) {
  const now = Date.now();
  const safetyMs = eveConfig.REFRESH?.tokenExpirySafetyMs ?? 60000;
  if (!force && account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt > now + safetyMs) {
    const token = storage.decryptSecret(account.accessTokenEnc);
    if (token) return token;
  }
  const refreshToken = storage.decryptSecret(account.refreshTokenEnc);
  if (!refreshToken) throw new Error('Missing refresh token. Remove and add this character again.');
  const tokens = await eve.refreshAccessToken(refreshToken);
  account.refreshTokenEnc = storage.encryptSecret(tokens.refreshToken);
  account.accessTokenEnc = storage.encryptSecret(tokens.accessToken);
  account.accessTokenExpiresAt = tokens.expiresAt;
  account.lastError = null;
  saveAccounts();
  return tokens.accessToken;
}

function addTestPilot(characterId, characterName) {
  if (accounts.find(a => Number(a.characterId) === Number(characterId))) return;
  accounts.push({ characterId: Number(characterId), characterName, testPilot: true, addedAt: new Date().toISOString() });
  broadcastAccounts();
}

function removeTestPilots() {
  const before = accounts.length;
  accounts = accounts.filter(a => !a.testPilot);
  if (accounts.length !== before) broadcastAccounts();
}

async function addAccount(scopeChoice) {
  if (loginInProgress) { sso.cancelLogin(); await new Promise((r) => setTimeout(r, 50)); }
  loginInProgress = true;
  try {
    const login = await eve.startLogin(true, scopeChoice);
    let account = accounts.find((e) => Number(e.characterId) === Number(login.characterId));
    if (!account) account = { characterId: Number(login.characterId), addedAt: new Date().toISOString(), testPilot: false };
    account.characterName = login.characterName;
    account.refreshTokenEnc = storage.encryptSecret(login.refreshToken);
    account.accessTokenEnc = storage.encryptSecret(login.accessToken);
    account.accessTokenExpiresAt = login.expiresAt;
    account.scopes = login.scopes || scopesFromAccessToken(login.accessToken) || null;
    account.lastError = null;
    await refreshModule.refreshCharacter(account, module.exports);
    broadcastAccounts();
    return getPublicAccounts();
  } finally { loginInProgress = false; }
}

function cancelLogin() { sso.cancelLogin(); }

function removeAccount(characterId) {
  const numericId = Number(characterId);
  accounts = accounts.filter((a) => Number(a.characterId) !== numericId);
  callbacks.onAccountRemoved(numericId);
  broadcastAccounts();
  return getPublicAccounts();
}

module.exports = {
  init, loadAccounts, getAccounts, getPublicAccounts, emitRefreshState,
  isRefreshing, setRefreshing, getRateLimitedUntil, setRateLimitedUntil,
  emitSkillCompleted, emitQueueEmpty, emitQueueWarning,
  enterRateLimit, waitRateLimit, waitErrorBudget, saveAccounts, broadcastAccounts,
  getValidAccessToken, addAccount, cancelLogin, removeAccount, ensureScopes,
  scopesFromAccessToken, addTestPilot, removeTestPilots,
  refreshAll: () => refreshModule.refreshAll(module.exports)
};
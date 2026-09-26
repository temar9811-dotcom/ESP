// File: main/accounts.js | Version: 1.1
'use strict';
const storage = require('../storage');
const eve = require('../eve');
const sso = require('../eve/sso');
const settings = require('./settings');
const notesStore = require('./notes');
const eveConfig = require('../eve/config');
const debugLogger = require('./debug/logger');

let accounts = [];
let loginInProgress = false;
let refreshInProgress = false;
let rateLimitedUntil = 0;
let callbacks = {
  onBroadcast: () => {}, onSkillCompleted: () => {}, onQueueWarning: () => {},
  onQueueEmpty: () => {}, onWalletActivity: () => {}, onRefreshState: () => {}, onAccountRemoved: () => {}
};

function init(newCallbacks) { callbacks = { ...callbacks, ...(newCallbacks || {}) }; }

function scopesFromAccessToken(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length < 2) return null;
    const padded = parts[1].padEnd(parts[1].length + ((4 - (parts[1].length % 4)) % 4), '=');
    const payload = JSON.parse(Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
    return Array.isArray(payload.scp) ? payload.scp : typeof payload.scp === 'string' ? [payload.scp] : null;
  } catch { return null; }
}

function ensureScopes(account) {
  if (!account || account.scopes != null) return account ? account.scopes : [];
  const scopes = scopesFromAccessToken(storage.decryptSecret(account.accessTokenEnc));
  if (scopes) { account.scopes = scopes; saveAccounts(); }
  return account.scopes;
}

function loadAccounts() {
  debugLogger.info('ACCOUNTS', 'Loading accounts from storage');
  accounts = storage.loadAccounts();
  let backfilled = false;
  for (const account of accounts) {
    account.notes = notesStore.getNote(account.characterId);
    if (account.scopes == null) {
      const scopes = scopesFromAccessToken(storage.decryptSecret(account.accessTokenEnc));
      if (scopes) { account.scopes = scopes; backfilled = true; }
    }
  }
  if (backfilled) saveAccounts();
  debugLogger.info('ACCOUNTS', `Loaded ${accounts.length} accounts`);
}

const getAccounts = () => accounts;
const getPublicAccounts = () => accounts.map(({ refreshTokenEnc, accessTokenEnc, ...safe }) => safe);
const getRefreshState = () => ({ refreshing: refreshInProgress, rateLimitedUntil });
const emitRefreshState = () => callbacks.onRefreshState(getRefreshState());
const isRefreshing = () => refreshInProgress;
const setRefreshing = (val) => { refreshInProgress = val; };
const getRateLimitedUntil = () => rateLimitedUntil;
const setRateLimitedUntil = (val) => { rateLimitedUntil = val; };
const emitSkillCompleted = (p) => callbacks.onSkillCompleted(p);
const emitQueueEmpty = (p) => callbacks.onQueueEmpty(p);
const emitQueueWarning = (p) => callbacks.onQueueWarning(p);
const emitWalletActivity = (p) => callbacks.onWalletActivity(p);

function enterRateLimit(seconds) {
  const until = Date.now() + Math.max(5, Number(seconds) || 60) * 1000;
  if (until > rateLimitedUntil) {
    rateLimitedUntil = until;
    debugLogger.warn('ACCOUNTS', `Rate limited for ${seconds || 60}s`);
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
  if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
}

function saveAccounts() { 
  storage.saveAccounts(accounts); 
  debugLogger.debug('ACCOUNTS', 'Accounts saved to storage');
}

function broadcastAccounts() { 
  saveAccounts(); 
  const publicAccs = getPublicAccounts();
  callbacks.onBroadcast(publicAccs);
  debugLogger.info('ACCOUNTS', `Broadcast ${publicAccs.length} accounts to UI`);
}

async function getValidAccessToken(account, force = false) {
  const now = Date.now(), safetyMs = eveConfig.REFRESH?.tokenExpirySafetyMs ?? 60000;
  if (!force && account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt > now + safetyMs) {
    const token = storage.decryptSecret(account.accessTokenEnc);
    if (token) return token;
  }
  debugLogger.debug('ACCOUNTS', `Refreshing token for ${account.characterName || account.characterId}`);
  const refreshToken = storage.decryptSecret(account.refreshTokenEnc);
  if (!refreshToken) throw new Error('Missing refresh token.');
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
  debugLogger.debug('ACCOUNTS', `Applied dashboard for ${account.characterName}: wallet=${dashboard.wallet?.balance}, queue=${dashboard.queue?.length || 0}`);
}

async function refreshCharacter(account) {
  debugLogger.info('ACCOUNTS', `Refreshing character: ${account.characterName || account.characterId}`);
  try {
    let token = await getValidAccessToken(account, false);
    const cachedSkills = require('./pullers/skills-data').getCache()[account.characterId] || null;
    let dashboard;
    try { dashboard = await eve.getDashboard(account.characterId, token, cachedSkills); }
    catch (err) {
      if (err && err.status === 401) {
        token = await getValidAccessToken(account, true);
        dashboard = await eve.getDashboard(account.characterId, token, cachedSkills);
      } else throw err;
    }
    applyDashboard(account, dashboard);
    debugLogger.info('ACCOUNTS', `Refresh complete for ${account.characterName}`);
  } catch (err) {
    account.lastError = err?.message || String(err);
    debugLogger.error('ACCOUNTS', `Refresh failed for ${account.characterName || account.characterId}`, { error: err?.message, status: err?.status });
    if (err && err.status === 420) enterRateLimit(Number(err.resetSeconds) || 60);
    else await waitErrorBudget();
  }
}

async function refreshAll() {
  if (refreshInProgress) return getPublicAccounts();
  refreshInProgress = true;
  emitRefreshState();
  debugLogger.info('ACCOUNTS', 'Starting refreshAll');
  try {
    const queue = [...accounts].filter((account) => !account.testPilot);
    const concurrency = Math.min(5, queue.length || 1);
    debugLogger.info('ACCOUNTS', `Refreshing ${queue.length} characters with concurrency ${concurrency}`);
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        await waitRateLimit();
        const account = queue.shift();
        if (!account) break;
        await refreshCharacter(account);
      }
    });
    await Promise.allSettled(workers);
    if (rateLimitedUntil && rateLimitedUntil <= Date.now()) rateLimitedUntil = 0;
    broadcastAccounts();
    debugLogger.info('ACCOUNTS', 'refreshAll complete');
    return getPublicAccounts();
  } finally {
    refreshInProgress = false;
    emitRefreshState();
  }
}

async function addAccount(scopeChoice) {
  if (loginInProgress) { sso.cancelLogin(); await new Promise((r) => setTimeout(r, 50)); }
  loginInProgress = true;
  debugLogger.info('ACCOUNTS', 'Adding new account');
  try {
    const login = await eve.startLogin(true, scopeChoice);
    let account = accounts.find((e) => Number(e.characterId) === Number(login.characterId));
    if (!account) {
      account = { characterId: Number(login.characterId), addedAt: new Date().toISOString(), testPilot: false };
      accounts.push(account);
    }
    account.characterName = login.characterName;
    account.refreshTokenEnc = storage.encryptSecret(login.refreshToken);
    account.accessTokenEnc = storage.encryptSecret(login.accessToken);
    account.accessTokenExpiresAt = login.expiresAt;
    account.scopes = login.scopes || scopesFromAccessToken(login.accessToken) || null;
    account.lastError = null;
    await refreshCharacter(account);
    broadcastAccounts();
    debugLogger.info('ACCOUNTS', `Account added: ${login.characterName}`);
    return getPublicAccounts();
  } finally { loginInProgress = false; }
}

function cancelLogin() { sso.cancelLogin(); }

function removeAccount(characterId) {
  accounts = accounts.filter((a) => Number(a.characterId) !== Number(characterId));
  callbacks.onAccountRemoved(Number(characterId));
  broadcastAccounts();
  debugLogger.info('ACCOUNTS', `Account removed: ${characterId}`);
  return getPublicAccounts();
}

function setIgnoreNoTraining(characterId, value) {
  const acc = accounts.find((a) => Number(a.characterId) === Number(characterId));
  if (!acc) return;
  acc.ignoreNoTraining = Boolean(value);
  saveAccounts();
  broadcastAccounts();
  debugLogger.info('ACCOUNTS', `${acc.characterName || characterId} ignoreNoTraining=${acc.ignoreNoTraining}`);
}

module.exports = {
  init, loadAccounts, getAccounts, getPublicAccounts, getRefreshState, emitRefreshState,
  isRefreshing, setRefreshing, getRateLimitedUntil, setRateLimitedUntil,
  emitSkillCompleted, emitQueueEmpty, emitQueueWarning, emitWalletActivity,
  enterRateLimit, waitRateLimit, waitErrorBudget, saveAccounts, broadcastAccounts,
  getValidAccessToken, refreshCharacter, refreshAll, addAccount, cancelLogin, removeAccount,
  setIgnoreNoTraining, ensureScopes, scopesFromAccessToken, addTestPilot, removeTestPilots
};
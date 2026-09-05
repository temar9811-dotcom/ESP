// File Version: 1.1.15-beta
'use strict';
const storage = require('../storage');
const eve = require('../eve');
const sso = require('../eve/sso');
const settings = require('./settings');
const skillHistory = require('./skill-history');
const notesStore = require('./notes');
const eveConfig = require('../eve/config');

let accounts = [];
let loginInProgress = false;
let refreshInProgress = false;
let rateLimitedUntil = 0;
let callbacks = {
  onBroadcast: () => {}, onSkillCompleted: () => {}, onQueueWarning: () => {},
  onQueueEmpty: () => {}, onRefreshState: () => {}, onAccountRemoved: () => {}
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
  accounts = storage.loadAccounts();
  let backfilled = false;
  for (const account of accounts) {
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
    account.notes = notesStore.getNote(account.characterId);
    if (account.scopes == null) {
      const scopes = scopesFromAccessToken(storage.decryptSecret(account.accessTokenEnc));
      if (scopes) { account.scopes = scopes; backfilled = true; }
    }
  }
  if (backfilled) saveAccounts();
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

function enterRateLimit(seconds) {
  const until = Date.now() + Math.max(5, Number(seconds) || 60) * 1000;
  if (until > rateLimitedUntil) {
    rateLimitedUntil = until;
    console.warn(`[ESI] rate limited`);
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

function saveAccounts() { storage.saveAccounts(accounts); }
function broadcastAccounts() { saveAccounts(); callbacks.onBroadcast(getPublicAccounts()); }

async function getValidAccessToken(account, force = false) {
  const now = Date.now(), safetyMs = eveConfig.REFRESH?.tokenExpirySafetyMs ?? 60000;
  if (!force && account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt > now + safetyMs) {
    const token = storage.decryptSecret(account.accessTokenEnc);
    if (token) return token;
  }
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
}

function checkSkillCompletion(account, dashboard) {
  const currentActive = dashboard.active || null;
  const now = Date.now();
  if (account.lastSeenActiveSkill) {
    const lastSkill = account.lastSeenActiveSkill;
    const lastFinishTime = new Date(lastSkill.finish_date).getTime();
    if (!Number.isNaN(lastFinishTime) && lastFinishTime <= now) {
      const lastKey = `${lastSkill.skill_id}-${lastSkill.finished_level}-${lastSkill.finish_date}`;
      const currentKey = currentActive ? `${currentActive.skill_id}-${currentActive.finished_level}-${currentActive.finish_date}` : 'none';
      if (lastKey !== currentKey) {
        skillHistory.recordCompletion(account.characterId, { skillId: lastSkill.skill_id, skillName: lastSkill.skillName || 'Unknown skill', level: lastSkill.finished_level || 0, finishedAt: lastSkill.finish_date });
        callbacks.onSkillCompleted({ characterId: account.characterId, characterName: account.characterName || 'Unknown', skillName: lastSkill.skillName || 'Unknown skill', level: lastSkill.finished_level || '?' });
        if (!currentActive) callbacks.onQueueEmpty({ characterId: account.characterId, characterName: account.characterName || 'Unknown' });
      }
    }
  }
  account.lastSeenActiveSkill = currentActive ? { ...currentActive } : null;
}

function checkQueueWarning(account, dashboard) {
  const current = settings.getSettings() || {};
  if (current.notifyQueueEmpty === false) return;
  const warnHours = Number(current.queueWarnHours ?? 24) || 24;
  const warnMs = warnHours * 60 * 60 * 1000;
  const remaining = Number(dashboard.queueRemainingMs || 0);
  const hasQueue = Boolean(dashboard.active) || (Array.isArray(dashboard.queue) && dashboard.queue.length > 0);
  if (!hasQueue || remaining <= 0 || remaining > warnMs) { account.lastQueueWarnKey = null; return; }
  const lastEntry = (Array.isArray(dashboard.queue) && dashboard.queue.length ? dashboard.queue[dashboard.queue.length - 1] : dashboard.active) || {};
  const key = `${lastEntry.finish_date || 'active'}:${warnHours}`;
  if (account.lastQueueWarnKey === key) return;
  account.lastQueueWarnKey = key;
  callbacks.onQueueWarning({ characterId: account.characterId, characterName: account.characterName || 'Unknown', remainingMs: remaining });
}

async function refreshCharacter(account) {
  try {
    let token = await getValidAccessToken(account, false);
    const skillsSync = require('./skills-sync');
    const cachedSkills = skillsSync.getSkills(account.characterId);
    let dashboard;
    try { dashboard = await eve.getDashboard(account.characterId, token, cachedSkills); }
    catch (err) {
      if (err && err.status === 401) {
        token = await getValidAccessToken(account, true);
        dashboard = await eve.getDashboard(account.characterId, token, cachedSkills);
      } else throw err;
    }
    applyDashboard(account, dashboard);
    checkSkillCompletion(account, dashboard);
    checkQueueWarning(account, dashboard);
    skillHistory.seedFromQueue(account.characterId, dashboard.queue);
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
  } catch (err) {
    account.lastError = err?.message || String(err);
    console.error('[ESI]', account.characterName || account.characterId, err?.status ?? '', err?.message || String(err));
    if (err && err.status === 420) enterRateLimit(Number(err.resetSeconds) || 60);
    else await waitErrorBudget();
  }
}

async function refreshAll() {
  if (refreshInProgress) return getPublicAccounts();
  refreshInProgress = true;
  emitRefreshState();
  try {
    const queue = [...accounts].filter((account) => !account.testPilot);
    const concurrency = Math.min(5, queue.length || 1);
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
    return getPublicAccounts();
  } finally {
    refreshInProgress = false;
    emitRefreshState();
  }
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
    await refreshCharacter(account);
    broadcastAccounts();
    return getPublicAccounts();
  } finally { loginInProgress = false; }
}

function cancelLogin() { sso.cancelLogin(); }

function removeAccount(characterId) {
  accounts = accounts.filter((a) => Number(a.characterId) !== Number(characterId));
  callbacks.onAccountRemoved(Number(characterId));
  broadcastAccounts();
  return getPublicAccounts();
}

module.exports = {
  init, loadAccounts, getAccounts, getPublicAccounts, getRefreshState, emitRefreshState,
  isRefreshing, setRefreshing, getRateLimitedUntil, setRateLimitedUntil,
  emitSkillCompleted, emitQueueEmpty, emitQueueWarning,
  enterRateLimit, waitRateLimit, waitErrorBudget, saveAccounts, broadcastAccounts,
  getValidAccessToken, refreshCharacter, refreshAll, addAccount, cancelLogin, removeAccount,
  ensureScopes, scopesFromAccessToken, addTestPilot, removeTestPilots
};
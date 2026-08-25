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
  onBroadcast: () => {},
  onSkillCompleted: () => {},
  onQueueWarning: () => {},
  onRefreshState: () => {},
  onAccountRemoved: () => {}
};

function init(newCallbacks) {
  callbacks = {
    ...callbacks,
    ...(newCallbacks || {})
  };
}

// Decode the granted scopes (scp claim) from an EVE SSO access token JWT.
// Works even for expired tokens — the grant is readable without verification.
function scopesFromAccessToken(accessToken) {
  try {
    const parts = String(accessToken || '').split('.');
    if (parts.length < 2) return null;

    const padded = parts[1].padEnd(
      parts[1].length + ((4 - (parts[1].length % 4)) % 4),
      '='
    );
    const payload = JSON.parse(
      Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    );

    if (Array.isArray(payload.scp)) return payload.scp;
    if (typeof payload.scp === 'string') return [payload.scp];
    return null;
  } catch {
    return null;
  }
}

// Re-derive scopes from the current access token when missing (imported or
// backfill-failed accounts) and persist the result.
function ensureScopes(account) {
  if (!account) return [];
  if (account.scopes != null) return account.scopes;

  const token = storage.decryptSecret(account.accessTokenEnc);
  const scopes = scopesFromAccessToken(token);

  if (scopes) {
    account.scopes = scopes;
    saveAccounts();
  }

  return account.scopes;
}

function loadAccounts() {
  accounts = storage.loadAccounts();

  let backfilled = false;

  for (const account of accounts) {
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
    account.notes = notesStore.getNote(account.characterId);

    // Backfill scopes for accounts created before scope storage existed
    if (account.scopes == null) {
      const token = storage.decryptSecret(account.accessTokenEnc);
      const scopes = scopesFromAccessToken(token);
      if (scopes) {
        account.scopes = scopes;
        backfilled = true;
      }
    }
  }

  if (backfilled) saveAccounts();
}

function getAccounts() {
  return accounts;
}

function getPublicAccounts() {
  return accounts.map((account) => {
    const { refreshTokenEnc, accessTokenEnc, ...safe } = account;
    return safe;
  });
}

function getRefreshState() {
  return {
    refreshing: refreshInProgress,
    rateLimitedUntil
  };
}

function emitRefreshState() {
  callbacks.onRefreshState(getRefreshState());
}

function enterRateLimit(seconds) {
  const cooldown = Math.max(5, Number(seconds) || 60);
  const until = Date.now() + cooldown * 1000;

  if (until > rateLimitedUntil) {
    rateLimitedUntil = until;
    console.warn(`[ESI] rate limited — cooling down ${cooldown}s`);
    emitRefreshState();
  }
}

async function waitRateLimit() {
  const waitMs = rateLimitedUntil - Date.now();

  if (waitMs > 0) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }
}

function saveAccounts() {
  storage.saveAccounts(accounts);
}

function broadcastAccounts() {
  saveAccounts();
  callbacks.onBroadcast(getPublicAccounts());
}

async function getValidAccessToken(account, force = false) {
  const now = Date.now();
  const safetyMs = eveConfig.REFRESH?.tokenExpirySafetyMs ?? 60000;

  if (
    !force &&
    account.accessTokenEnc &&
    account.accessTokenExpiresAt &&
    account.accessTokenExpiresAt > now + safetyMs
  ) {
    const token = storage.decryptSecret(account.accessTokenEnc);

    if (token) {
      return token;
    }
  }

  const refreshToken = storage.decryptSecret(account.refreshTokenEnc);

  if (!refreshToken) {
    throw new Error('Missing refresh token. Remove and add this character again.');
  }

  const tokens = await eve.refreshAccessToken(refreshToken);

  account.refreshTokenEnc = storage.encryptSecret(tokens.refreshToken);
  account.accessTokenEnc = storage.encryptSecret(tokens.accessToken);
  account.accessTokenExpiresAt = tokens.expiresAt;
  account.lastError = null;

  saveAccounts();
  return tokens.accessToken;
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
      const currentKey = currentActive
        ? `${currentActive.skill_id}-${currentActive.finished_level}-${currentActive.finish_date}`
        : 'none';

      if (lastKey !== currentKey) {
        skillHistory.recordCompletion(account.characterId, {
          skillId: lastSkill.skill_id,
          skillName: lastSkill.skillName || 'Unknown skill',
          level: lastSkill.finished_level || 0,
          finishedAt: lastSkill.finish_date
        });

        callbacks.onSkillCompleted({
          characterName: account.characterName || 'Unknown',
          skillName: lastSkill.skillName || 'Unknown skill',
          level: lastSkill.finished_level || '?'
        });
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
  const hasQueue =
    Boolean(dashboard.active) ||
    (Array.isArray(dashboard.queue) && dashboard.queue.length > 0);

  if (!hasQueue || remaining <= 0 || remaining > warnMs) {
    account.lastQueueWarnKey = null;
    return;
  }

  const lastEntry =
    (Array.isArray(dashboard.queue) && dashboard.queue.length
      ? dashboard.queue[dashboard.queue.length - 1]
      : dashboard.active) || {};

  const key = `${lastEntry.finish_date || 'active'}:${warnHours}`;

  if (account.lastQueueWarnKey === key) return;

  account.lastQueueWarnKey = key;
  callbacks.onQueueWarning({
    characterName: account.characterName || 'Unknown',
    remainingMs: remaining
  });
}

async function refreshCharacter(account) {
  try {
    let token = await getValidAccessToken(account, false);

    let dashboard;

    try {
      dashboard = await eve.getDashboard(account.characterId, token);
    } catch (err) {
      if (err && err.status === 401) {
        token = await getValidAccessToken(account, true);
        dashboard = await eve.getDashboard(account.characterId, token);
      } else {
        throw err;
      }
    }

    applyDashboard(account, dashboard);
    checkSkillCompletion(account, dashboard);
    checkQueueWarning(account, dashboard);

    skillHistory.seedFromQueue(account.characterId, dashboard.queue);
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
  } catch (err) {
    account.lastError = err?.message || String(err);
    console.error(
      '[ESI]',
      account.characterName || account.characterId,
      err?.status ?? '',
      err?.message || String(err)
    );

    if (err && err.status === 420) {
      enterRateLimit(Number(err.resetSeconds) || 60);
    }
  }
}

async function refreshAll() {
  if (refreshInProgress) {
    return getPublicAccounts();
  }

  refreshInProgress = true;
  emitRefreshState();

  try {
    const queue = [...accounts];
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

    if (rateLimitedUntil && rateLimitedUntil <= Date.now()) {
      rateLimitedUntil = 0;
    }

    broadcastAccounts();
    return getPublicAccounts();
  } finally {
    refreshInProgress = false;
    emitRefreshState();
  }
}

async function addAccount(scopeChoice) {
  if (loginInProgress) {
    sso.cancelLogin();
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  loginInProgress = true;

  try {
    const login = await eve.startLogin(true, scopeChoice);

    let account = accounts.find(
      (existing) => Number(existing.characterId) === Number(login.characterId)
    );

    if (!account) {
      account = {
        characterId: Number(login.characterId),
        addedAt: new Date().toISOString()
      };
      accounts.push(account);
    }

    account.characterName = login.characterName;
    account.refreshTokenEnc = storage.encryptSecret(login.refreshToken);
    account.accessTokenEnc = storage.encryptSecret(login.accessToken);
    account.accessTokenExpiresAt = login.expiresAt;
    account.scopes =
      login.scopes ||
      scopesFromAccessToken(login.accessToken) ||
      null;
    account.lastError = null;

    await refreshCharacter(account);
    broadcastAccounts();
    return getPublicAccounts();
  } finally {
    loginInProgress = false;
  }
}

function cancelLogin() {
  sso.cancelLogin();
}

function removeAccount(characterId) {
  const numericId = Number(characterId);

  accounts = accounts.filter(
    (account) => Number(account.characterId) !== numericId
  );

  callbacks.onAccountRemoved(numericId);
  broadcastAccounts();
  return getPublicAccounts();
}

module.exports = {
  init,
  loadAccounts,
  getAccounts,
  getPublicAccounts,
  getRefreshState,
  enterRateLimit,
  waitRateLimit,
  saveAccounts,
  broadcastAccounts,
  getValidAccessToken,
  refreshCharacter,
  refreshAll,
  addAccount,
  cancelLogin,
  removeAccount,
  ensureScopes,
  scopesFromAccessToken
};
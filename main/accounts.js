'use strict';

const storage = require('../storage');
const eve = require('../eve');
const eveConfig = require('../eve/config');

let accounts = [];
let loginInProgress = false;
let refreshInProgress = false;

let callbacks = {
  onBroadcast: () => {},
  onSkillCompleted: () => {},
  onAccountRemoved: () => {}
};

function init(newCallbacks) {
  callbacks = {
    ...callbacks,
    ...(newCallbacks || {})
  };
}

function loadAccounts() {
  accounts = storage.loadAccounts();
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

async function refreshCharacter(account) {
  try {
    let token = await getValidAccessToken(account, false);

    try {
      const dashboard = await eve.getDashboard(account.characterId, token);
      applyDashboard(account, dashboard);
      checkSkillCompletion(account, dashboard);
    } catch (err) {
      if (err && err.status === 401) {
        token = await getValidAccessToken(account, true);
        const dashboard = await eve.getDashboard(account.characterId, token);
        applyDashboard(account, dashboard);
        checkSkillCompletion(account, dashboard);
      } else {
        throw err;
      }
    }
  } catch (err) {
    account.lastError = err?.message || String(err);
  }
}

async function refreshAll() {
  if (refreshInProgress) {
    return getPublicAccounts();
  }

  refreshInProgress = true;

  try {
    await Promise.allSettled(
      accounts.map((account) => refreshCharacter(account))
    );
    broadcastAccounts();
    return getPublicAccounts();
  } finally {
    refreshInProgress = false;
  }
}

async function addAccount(scopeChoice) {
  if (loginInProgress) {
    throw new Error('Login already in progress.');
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
    account.scopes = login.scopes;
    account.lastError = null;

    await refreshCharacter(account);
    broadcastAccounts();
    return getPublicAccounts();
  } finally {
    loginInProgress = false;
  }
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
  saveAccounts,
  broadcastAccounts,
  getValidAccessToken,
  refreshCharacter,
  refreshAll,
  addAccount,
  removeAccount
};
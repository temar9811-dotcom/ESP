'use strict';

window.ESP = window.ESP || {};

ESP.loadWalletDetails = async function (characterId, force = false) {
  if (!window.eveApi || !window.eveApi.getWalletDetails) {
    ESP.state.walletState[characterId] = {
      status: 'error',
      error: 'Wallet details are not available.'
    };
    ESP.render(ESP.state.lastAccounts);
    return;
  }

  const existing = ESP.state.walletState[characterId];

  if (
    !force &&
    existing &&
    (existing.status === 'loading' || existing.status === 'loaded')
  ) {
    return;
  }

  ESP.state.walletState[characterId] = {
    status: 'loading'
  };

  ESP.render(ESP.state.lastAccounts);

  try {
    const data = await window.eveApi.getWalletDetails(characterId);

    ESP.state.walletState[characterId] = {
      status: 'loaded',
      data
    };
  } catch (err) {
    ESP.state.walletState[characterId] = {
      status: 'error',
      error: err?.message || String(err)
    };
  }

  ESP.render(ESP.state.lastAccounts);
};

ESP.maybeAutoLoadWallet = function () {
  if (ESP.getActiveTab() !== 'wallet') return;
  if (ESP.state.openCharacterId == null) return;

  const id = Number(ESP.state.openCharacterId);
  const state = ESP.state.walletState[id];

  if (!state || state.status === 'idle') {
    ESP.loadWalletDetails(id);
  }
};

ESP.maybeAutoLoadAssets = function () {
  if (ESP.getActiveTab() !== 'assets') return;
  if (ESP.state.openCharacterId == null) return;

  const id = Number(ESP.state.openCharacterId);
  const account = ESP.state.lastAccounts.find(
    (a) => Number(a.characterId) === id
  );

  if (account && account.clones === undefined) {
    ESP.loadCloneDetails(id);
  }
};

ESP.loadCloneDetails = async function (characterId, force) {
  const account = ESP.state.lastAccounts.find(
    (a) => Number(a.characterId) === Number(characterId)
  );
  if (!account) return;

  account.clones = null;
  ESP.render(ESP.state.lastAccounts);

  try {
    const details = await window.eveApi.getCloneDetails(characterId);
    account.clones = details;
  } catch (err) {
    account.clones = { error: err?.message || String(err) };
  }

  ESP.render(ESP.state.lastAccounts);
};

ESP.load = async function () {
  try {
    const accounts = await window.eveApi.listAccounts();
    ESP.render(accounts);
  } catch (err) {
    ESP.setStatus(err?.message || String(err), true);
  }
};

ESP.loadVersion = async function () {
  const versionEl = document.getElementById('version');

  if (!versionEl || !window.eveApi || !window.eveApi.getVersion) {
    return;
  }

  try {
    const version = await window.eveApi.getVersion();
    versionEl.textContent = `v${version}`;
  } catch {
    versionEl.textContent = '';
  }
};

ESP.loadPlans = async function () {
  try {
    ESP.state.plans = await window.eveApi.listPlans();
  } catch {
    ESP.state.plans = [];
  }

  ESP.render(ESP.state.lastAccounts);
  ESP.renderModals();
};

ESP.loadGroups = async function () {
  if (!window.eveApi || !window.eveApi.getGroups) {
    return;
  }

  try {
    ESP.state.groups = await window.eveApi.getGroups();
  } catch {
    ESP.state.groups = {};
  }
};

ESP.loadSettings = async function () {
  if (!window.eveApi || !window.eveApi.getSettings) {
    return;
  }

  try {
    ESP.state.settings = await window.eveApi.getSettings();
  } catch {
    ESP.state.settings = {};
  }
};

ESP.loadCorpInfo = async function (characterId) {
  if (!window.eveApi || !window.eveApi.getCorpInfo) {
    return;
  }

  ESP.state.corpInfoByCharacter = ESP.state.corpInfoByCharacter || {};

  if (ESP.state.corpInfoByCharacter[characterId]) {
    return;
  }

  ESP.state.corpInfoByCharacter[characterId] = {
    corporation: null,
    alliance: null,
    loading: true
  };

  ESP.render(ESP.state.lastAccounts);

  try {
    const info = await window.eveApi.getCorpInfo(characterId);

    ESP.state.corpInfoByCharacter[characterId] = {
      corporation: info?.corporation || null,
      alliance: info?.alliance || null,
      loading: false
    };
  } catch {
    ESP.state.corpInfoByCharacter[characterId] = {
      corporation: null,
      alliance: null,
      loading: false
    };
  }

  ESP.render(ESP.state.lastAccounts);
};
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
  if (ESP.state.openCharacterId == null) return;

  const activeTab = ESP.getActiveTab(ESP.state.openCharacterId);
  if (activeTab !== 'wallet') return;

  const state = ESP.state.walletState[ESP.state.openCharacterId];

  if (!state || state.status === 'idle') {
    ESP.loadWalletDetails(ESP.state.openCharacterId);
  }
};

ESP.render = function (accounts) {
  ESP.state.lastAccounts = Array.isArray(accounts) ? accounts : [];

  const stillExists = ESP.state.lastAccounts.some(
    (account) => Number(account.characterId) === Number(ESP.state.openCharacterId)
  );

  if (!stillExists) {
    ESP.state.openCharacterId = null;
  }

  for (const key of Object.keys(ESP.state.walletState)) {
    const id = Number(key);

    const exists = ESP.state.lastAccounts.some(
      (account) => Number(account.characterId) === id
    );

    if (!exists) {
      delete ESP.state.walletState[id];
      delete ESP.state.activeTabByCharacter[id];
    }
  }

  const accountsEl = document.getElementById('accounts');
  if (!accountsEl) return;

  if (!ESP.state.lastAccounts.length) {
    accountsEl.innerHTML = `
<div class="empty">
  No characters added yet.<br /><br />
  Click <strong>Add character</strong> to log in with EVE SSO.
</div>
`;
    return;
  }

  accountsEl.innerHTML = ESP.state.lastAccounts
    .map(ESP.characterTabHtml)
    .join('');

  ESP.maybeAutoLoadWallet();
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
ESP.bindEvents = function () {
  const accountsEl = document.getElementById('accounts');
  const addBtn = document.getElementById('add');
  const refreshBtn = document.getElementById('refresh');
  const addPlanBtn = document.getElementById('addPlan');
  const settingsBtn = document.getElementById('settings');
  const modalRoot = ESP.getModalRoot();

  if (modalRoot) {
    modalRoot.addEventListener('input', (event) => {
      if (!ESP.state.addPlanState) return;

      if (event.target.id === 'planNameInput') {
        ESP.state.addPlanState.name = event.target.value;
      }
    });

    modalRoot.addEventListener('change', (event) => {
      if (!ESP.state.addPlanState) return;

      if (event.target.name === 'planScope') {
        ESP.state.addPlanState.scope = event.target.value;
        ESP.renderModals();
      }

      if (event.target.id === 'planCharacterSelect') {
        ESP.state.addPlanState.characterId = event.target.value;
      }
    });

    modalRoot.addEventListener('click', async (event) => {
      const closeBtn = event.target.closest('.modal-close');
      const cancelBtn = event.target.closest('.modal-cancel');

      if (closeBtn || cancelBtn) {
        ESP.state.addPlanState = null;
        ESP.state.planDetail = null;
        ESP.state.settingsOpen = false;
        ESP.renderModals();
        return;
      }

      const importBtn = event.target.closest('.import-legacy');

      if (importBtn) {
        importBtn.disabled = true;

        try {
          const summary = await window.eveApi.importLegacy();

          if (summary.ok) {
            ESP.showToast(
              'Import complete',
              `Imported ${summary.importedAccounts} characters and ${summary.importedPlans} plans. Skipped ${summary.skippedAccounts} existing.`
            );
            ESP.setStatus('Import complete.');
            await ESP.loadPlans();
            await ESP.load();
            ESP.state.settingsOpen = false;
            ESP.renderModals();
          } else {
            ESP.setStatus(summary.error || 'Import failed.', true);
            importBtn.disabled = false;
          }
        } catch (err) {
          ESP.setStatus(err?.message || String(err), true);
          importBtn.disabled = false;
        }

        return;
      }

      const saveBtn = event.target.closest('.modal-save');

      if (saveBtn) {
        await ESP.saveAddPlanModal();
        return;
      }

      if (event.target.classList.contains('modal-overlay')) {
        ESP.state.addPlanState = null;
        ESP.state.planDetail = null;
        ESP.state.settingsOpen = false;
        ESP.renderModals();
      }
    });
  }
    if (accountsEl) {
    accountsEl.addEventListener('click', async (event) => {
      const characterTab = event.target.closest('.character-tab');

      if (characterTab) {
        const id = Number(characterTab.dataset.id);

        ESP.state.openCharacterId =
          ESP.state.openCharacterId === id ? null : id;

        ESP.render(ESP.state.lastAccounts);
        return;
      }

      const sheetTab = event.target.closest('.sheet-tab');

      if (sheetTab) {
        const id = Number(sheetTab.dataset.id);
        const tab = sheetTab.dataset.tab;

        ESP.state.activeTabByCharacter[id] = tab;

        if (tab === 'wallet') {
          ESP.loadWalletDetails(id);
        }

        ESP.render(ESP.state.lastAccounts);
        return;
      }

      const retryBtn = event.target.closest('.wallet-retry');

      if (retryBtn) {
        const id = Number(retryBtn.dataset.id);
        ESP.loadWalletDetails(id, true);
        return;
      }

      const removeBtn = event.target.closest('.remove');

      if (removeBtn) {
        const id = Number(removeBtn.dataset.id);

        if (!confirm('Remove this character?')) return;

        removeBtn.disabled = true;

        try {
          await window.eveApi.removeAccount(id);

          if (ESP.state.openCharacterId === id) {
            ESP.state.openCharacterId = null;
          }

          delete ESP.state.walletState[id];
          delete ESP.state.activeTabByCharacter[id];

          await ESP.load();
          ESP.setStatus('Character removed.');
        } catch (err) {
          ESP.setStatus(err?.message || String(err), true);
        } finally {
          removeBtn.disabled = false;
        }

        return;
      }

      const planDeleteBtn = event.target.closest('.plan-delete');

      if (planDeleteBtn) {
        const planId = planDeleteBtn.dataset.planId;

        if (!confirm('Delete this skill plan?')) return;

        try {
          await window.eveApi.deletePlan(planId);

          if (ESP.state.planDetail && ESP.state.planDetail.id === planId) {
            ESP.state.planDetail = null;
          }

          await ESP.loadPlans();
          ESP.setStatus('Skill plan deleted.');
          ESP.render(ESP.state.lastAccounts);
        } catch (err) {
          ESP.setStatus(err?.message || String(err), true);
        }

        return;
      }

      const planBox = event.target.closest('.plan-box');

      if (planBox) {
        const planId = planBox.dataset.planId;

        ESP.state.planDetail =
          ESP.state.plans.find((plan) => plan.id === planId) || null;

        ESP.renderModals();
      }
    });
  }

  if (addPlanBtn) {
    addPlanBtn.addEventListener('click', () => {
      ESP.openAddPlanModal();
    });
  }

  if (settingsBtn) {
    settingsBtn.addEventListener('click', () => {
      ESP.openSettingsModal();
    });
  }

  if (addBtn) {
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      ESP.setStatus('Opening EVE login...');

      try {
        await window.eveApi.addAccount();
        await ESP.load();
        ESP.setStatus('Character added.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      } finally {
        addBtn.disabled = false;
      }
    });
  }

  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      refreshBtn.disabled = true;
      ESP.setStatus('Refreshing...');

      try {
        await window.eveApi.refreshAll();
        await ESP.load();
        ESP.setStatus('Refresh complete.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      } finally {
        refreshBtn.disabled = false;
      }
    });
  }

  if (window.eveApi && window.eveApi.onAccountsUpdated) {
    const unsubscribe = window.eveApi.onAccountsUpdated((accounts) => {
      ESP.render(accounts);
    });

    window.addEventListener('beforeunload', () => {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    });
  }
};
ESP.startEveTimeClock = function () {
  const eveTimeEl = document.getElementById('eve-time');
  if (!eveTimeEl) return;

  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  function tick() {
    eveTimeEl.textContent = `EVE Time: ${formatter.format(new Date())} UTC`;
  }

  tick();
  setInterval(tick, 1000);
};

ESP.initApp = function () {
  ESP.initToastListeners();
  ESP.bindEvents();
  ESP.startEveTimeClock();

  if (window.eveApi) {
    ESP.load();
    ESP.loadPlans();
    ESP.loadVersion();
  } else {
    ESP.setStatus('Preload failed. Restart the app.', true);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ESP.initApp);
} else {
  ESP.initApp();
}
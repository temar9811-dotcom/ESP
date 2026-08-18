'use strict';

window.ESP = window.ESP || {};

ESP.bindAccountEvents = function () {
  const accountsEl = document.getElementById('accounts');

  if (!accountsEl) return;

  accountsEl.addEventListener('input', (event) => {
    if (event.target.classList.contains('notes-input')) {
      const id = Number(event.target.dataset.id);
      ESP.state.notesDraft = ESP.state.notesDraft || {};
      ESP.state.notesDraft[id] = event.target.value;
    }
  });

  accountsEl.addEventListener('click', async (event) => {
    const starBtn = event.target.closest('.group-star');

    if (starBtn) {
      const id = Number(starBtn.dataset.id);

      try {
        await window.eveApi.setGroupPrimary(id);
        await ESP.loadGroups();
        ESP.render(ESP.state.lastAccounts);
        ESP.setStatus('Primary character set.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }

    const groupHeader = event.target.closest('.group-header');

    if (groupHeader) {
      const name = groupHeader.dataset.group;

      try {
        await window.eveApi.toggleGroup(name);
        await ESP.loadGroups();
        ESP.render(ESP.state.lastAccounts);
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }

    const characterTab = event.target.closest('.character-tab');

    if (characterTab) {
      const id = Number(characterTab.dataset.id);

      ESP.state.openCharacterId =
        ESP.state.openCharacterId === id ? null : id;

      ESP.render(ESP.state.lastAccounts);

      if (ESP.state.openCharacterId === id) {
        ESP.loadCorpInfo(id);
      }

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

    const setGroupBtn = event.target.closest('.set-group');

    if (setGroupBtn) {
      const id = Number(setGroupBtn.dataset.id);

      let current = '';

      for (const [name, group] of Object.entries(ESP.state.groups || {})) {
        if (name === '__ungrouped__') continue;

        if ((group.members || []).map(Number).includes(id)) {
          current = name;
          break;
        }
      }

      ESP.openGroupModal(id, current);
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

      const plan =
        ESP.state.plans.find((p) => p.id === planId) || null;

      ESP.state.planDetail = plan;

      if (plan && window.eveApi && window.eveApi.getSkillMeta) {
        const ids = (plan.entries || [])
          .map((entry) => entry.skillId)
          .filter(Boolean);

        try {
          plan.meta = await window.eveApi.getSkillMeta(ids);
        } catch {
          plan.meta = {};
        }
      }

      ESP.renderModals();
    }

    const notesSaveBtn = event.target.closest('.notes-save');

    if (notesSaveBtn) {
      const id = Number(notesSaveBtn.dataset.id);
      const draftMap = ESP.state.notesDraft || {};
      const text = draftMap[id] != null ? draftMap[id] : '';

      try {
        await window.eveApi.setNotes(id, text);

        const account = ESP.state.lastAccounts.find(
          (a) => Number(a.characterId) === id
        );
        if (account) account.notes = text;

        delete draftMap[id];
        ESP.setStatus('Notes saved.');
      } catch (err) {
        ESP.setStatus(err?.message || String(err), true);
      }

      return;
    }
  });
};
ESP.bindTopbarEvents = function () {
  const addBtn = document.getElementById('add');
  const refreshBtn = document.getElementById('refresh');
  const addPlanBtn = document.getElementById('addPlan');
  const settingsBtn = document.getElementById('settings');

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
    addBtn.addEventListener('click', () => {
      ESP.openAddCharacterModal();
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
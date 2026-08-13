'use strict';

window.ESP = window.ESP || {};

let loginAttempt = 0;

ESP.bindModalEvents = function () {
  const modalRoot = ESP.getModalRoot();

  if (!modalRoot) return;

  function persistSetting(key, value, rerender) {
    ESP.state.settings = ESP.state.settings || {};
    ESP.state.settings[key] = value;

    if (window.eveApi && window.eveApi.setSettings) {
      window.eveApi.setSettings({ [key]: value }).catch(() => {});
    }

    if (rerender) {
      ESP.render(ESP.state.lastAccounts);
    }
  }

  function cancelPendingLoginIfOpen() {
    if (
      ESP.state.addCharacter &&
      window.eveApi &&
      window.eveApi.cancelLogin
    ) {
      window.eveApi.cancelLogin().catch(() => {});
    }
  }

  modalRoot.addEventListener('input', (event) => {
    if (ESP.state.addPlanState && event.target.id === 'planNameInput') {
      ESP.state.addPlanState.name = event.target.value;
    }

    if (ESP.state.groupState && event.target.id === 'groupNameInput') {
      ESP.state.groupState.name = event.target.value;
    }
  });

  modalRoot.addEventListener('change', (event) => {
    if (ESP.state.addCharacter && event.target.name === 'addScope') {
      ESP.state.addCharacter.scope = event.target.value;
      return;
    }

    if (event.target.id === 'settingHidePrimary') {
      persistSetting('hidePrimaryWhenCollapsed', event.target.checked, true);
      return;
    }

    if (event.target.id === 'settingOpenAtLogin') {
      persistSetting('openAtLogin', event.target.checked);
      return;
    }

    if (event.target.id === 'settingStartMinimized') {
      persistSetting('startMinimized', event.target.checked);
      return;
    }

    if (event.target.id === 'settingMuteSounds') {
      persistSetting('muteSounds', event.target.checked);
      return;
    }

    if (event.target.id === 'settingNotifySkill') {
      persistSetting('notifySkill', event.target.checked);
      return;
    }

    if (event.target.id === 'settingNotifyWallet') {
      persistSetting('notifyWallet', event.target.checked);
      return;
    }

    if (event.target.id === 'settingWalletThreshold') {
      persistSetting(
        'walletNotifyThreshold',
        Math.max(0, Number(event.target.value) || 0)
      );
      return;
    }

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
      cancelPendingLoginIfOpen();

      ESP.state.addPlanState = null;
      ESP.state.planDetail = null;
      ESP.state.settingsOpen = false;
      ESP.state.groupState = null;
      ESP.state.addCharacter = null;
      ESP.renderModals();
      return;
    }

    const addCharBtn = event.target.closest('.add-character-save');

    if (addCharBtn) {
      addCharBtn.disabled = true;
      const scope = (ESP.state.addCharacter || {}).scope || 'future';
      const myAttempt = ++loginAttempt;

      ESP.setStatus('Opening EVE login...');

      try {
        await window.eveApi.addAccount(scope);

        ESP.state.addCharacter = null;
        ESP.renderModals();
        await ESP.load();
        ESP.setStatus('Character added.');
      } catch (err) {
        const msg = err?.message || String(err);

        if (!msg.includes('Login cancelled.')) {
          ESP.setStatus(msg, true);
        } else if (myAttempt === loginAttempt) {
          ESP.setStatus('Login cancelled.');
        }

        addCharBtn.disabled = false;
      }

      return;
    }

    const retryClip = event.target.closest('.retry-clipboard');

    if (retryClip) {
      await ESP.openAddPlanModal();
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
      if (ESP.state.groupState) {
        await ESP.saveGroupModal();
      } else {
        await ESP.saveAddPlanModal();
      }
      return;
    }

    if (event.target.classList.contains('modal-overlay')) {
      cancelPendingLoginIfOpen();

      ESP.state.addPlanState = null;
      ESP.state.planDetail = null;
      ESP.state.settingsOpen = false;
      ESP.state.groupState = null;
      ESP.state.addCharacter = null;
      ESP.renderModals();
    }
  });
};
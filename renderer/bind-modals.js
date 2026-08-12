'use strict';

window.ESP = window.ESP || {};

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

  modalRoot.addEventListener('input', (event) => {
    if (ESP.state.addPlanState && event.target.id === 'planNameInput') {
      ESP.state.addPlanState.name = event.target.value;
    }

    if (ESP.state.groupState && event.target.id === 'groupNameInput') {
      ESP.state.groupState.name = event.target.value;
    }
  });

  modalRoot.addEventListener('change', (event) => {
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
      ESP.state.addPlanState = null;
      ESP.state.planDetail = null;
      ESP.state.settingsOpen = false;
      ESP.state.groupState = null;
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
      if (ESP.state.groupState) {
        await ESP.saveGroupModal();
      } else {
        await ESP.saveAddPlanModal();
      }
      return;
    }

    if (event.target.classList.contains('modal-overlay')) {
      ESP.state.addPlanState = null;
      ESP.state.planDetail = null;
      ESP.state.settingsOpen = false;
      ESP.state.groupState = null;
      ESP.renderModals();
    }
  });
};
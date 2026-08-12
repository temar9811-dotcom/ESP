'use strict';

window.ESP = window.ESP || {};

ESP.bindModalEvents = function () {
  const modalRoot = ESP.getModalRoot();

  if (!modalRoot) return;

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
      ESP.state.settings = ESP.state.settings || {};
      ESP.state.settings.hidePrimaryWhenCollapsed = event.target.checked;

      if (window.eveApi && window.eveApi.setSettings) {
        window.eveApi
          .setSettings({ hidePrimaryWhenCollapsed: event.target.checked })
          .catch(() => {});
      }

      ESP.render(ESP.state.lastAccounts);
      return;
    }

    if (event.target.id === 'settingOpenAtLogin') {
      ESP.state.settings = ESP.state.settings || {};
      ESP.state.settings.openAtLogin = event.target.checked;

      if (window.eveApi && window.eveApi.setSettings) {
        window.eveApi
          .setSettings({ openAtLogin: event.target.checked })
          .catch(() => {});
      }

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
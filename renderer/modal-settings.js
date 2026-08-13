'use strict';

window.ESP = window.ESP || {};

ESP.settingsModalHtml = function (settings) {
  const importEnabled = !settings || settings.importEnabled !== false;
  const hidePrimary = Boolean(settings && settings.hidePrimaryWhenCollapsed);
  const openAtLogin = Boolean(settings && settings.openAtLogin);
  const startMinimized = Boolean(settings && settings.startMinimized);
  const muteSounds = Boolean(settings && settings.muteSounds);
  const notifySkill = !settings || settings.notifySkill !== false;
  const notifyWallet = !settings || settings.notifyWallet !== false;
  const notifyQueue = !settings || settings.notifyQueueEmpty !== false;
  const threshold = Number((settings && settings.walletNotifyThreshold) || 0);
  const queueHours =
    Number((settings && settings.queueWarnHours) ?? 24) || 24;

  const importRow = importEnabled
    ? `
<div class="form-row">
  <button type="button" class="modal-save import-legacy">
    Import characters from EVE Skill Tray
  </button>
</div>
`
    : '';

  const checkbox = (id, checked, label) => `
<div class="form-row">
  <label style="display:flex; align-items:center; gap:8px;">
    <input type="checkbox" id="${id}" ${checked ? 'checked' : ''} />
    ${label}
  </label>
</div>
`;

  return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Settings</h2>

    ${checkbox('settingHidePrimary', hidePrimary, 'Hide primary character when a group is collapsed')}
    ${checkbox('settingOpenAtLogin', openAtLogin, 'Start with Windows')}
    ${checkbox('settingStartMinimized', startMinimized, 'Start minimized to tray')}
    ${checkbox('settingMuteSounds', muteSounds, 'Mute notification sounds')}
    ${checkbox('settingNotifySkill', notifySkill, 'Show skill complete notifications')}
    ${checkbox('settingNotifyWallet', notifyWallet, 'Show wallet activity notifications')}
    ${checkbox('settingNotifyQueueEmpty', notifyQueue, 'Warn me before the skill queue runs dry')}

    <div class="form-row">
      <label for="settingQueueWarnHours">Warn when the queue has less time left than (hours)</label>
      <input
        id="settingQueueWarnHours"
        type="number"
        min="1"
        max="72"
        step="1"
        value="${queueHours}"
      />
    </div>

    <div class="form-row">
      <label for="settingWalletThreshold">Minimum ISK for wallet notifications</label>
      <input
        id="settingWalletThreshold"
        type="number"
        min="0"
        step="100000"
        value="${threshold}"
      />
    </div>

    ${importRow}

    <div class="modal-actions">
      <button type="button" class="modal-cancel">Close</button>
    </div>
  </div>
</div>
`;
};

ESP.openSettingsModal = async function () {
  if (!window.eveApi || !window.eveApi.getSettings) {
    ESP.setStatus('Settings are not available.', true);
    return;
  }

  ESP.state.settingsOpen = true;

  try {
    ESP.state.settings = await window.eveApi.getSettings();
  } catch {
    ESP.state.settings = { importEnabled: true };
  }

  ESP.renderModals();
};
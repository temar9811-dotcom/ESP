'use strict';

window.ESP = window.ESP || {};

ESP.getModalRoot = function () {
  return document.getElementById('modal-root');
};

ESP.renderModals = function () {
  const modalRoot = ESP.getModalRoot();
  if (!modalRoot) return;

  if (ESP.state.addPlanState) {
    modalRoot.innerHTML = ESP.addPlanModalHtml();
    return;
  }

  if (ESP.state.groupState) {
    modalRoot.innerHTML = ESP.groupModalHtml();
    return;
  }

  if (ESP.state.planDetail) {
    modalRoot.innerHTML = ESP.planDetailModalHtml(ESP.state.planDetail);
    return;
  }

  if (ESP.state.settingsOpen) {
    modalRoot.innerHTML = ESP.settingsModalHtml(ESP.state.settings);
    return;
  }

  modalRoot.innerHTML = '';
};

ESP.addPlanModalHtml = function () {
  const addPlanState = ESP.state.addPlanState;

  if (addPlanState.status === 'loading') {
    return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Add Skill Plan from Clipboard</h2>
    <div class="idle">Reading clipboard...</div>
  </div>
</div>
`;
  }

  if (addPlanState.status === 'empty') {
    return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Add Skill Plan from Clipboard</h2>
    <div class="idle">
      No skill plan found on the clipboard.<br /><br />
      In EVE, copy a skill queue or plan export, then try again.
    </div>
    <div class="modal-actions">
      <button type="button" class="modal-cancel">Close</button>
      <button type="button" class="retry-clipboard">Try again</button>
    </div>
  </div>
</div>
`;
  }

  if (addPlanState.status === 'error') {
    return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Add Skill Plan from Clipboard</h2>
    <div class="error">${ESP.escapeHtml(addPlanState.error)}</div>
  </div>
</div>
`;
  }

  const entries = addPlanState.entries;
  const unknownCount = entries.filter((entry) => !entry.skillId).length;

  const characterOptions = ESP.state.lastAccounts
    .map(
      (account) => `
<option
  value="${account.characterId}"
  ${String(account.characterId) === String(addPlanState.characterId) ? 'selected' : ''}
>
  ${ESP.escapeHtml(account.characterName || `Character ${account.characterId}`)}
</option>
`
    )
    .join('');

  const errorsHtml = addPlanState.errors.length
    ? `<div class="error">${ESP.escapeHtml(addPlanState.errors.join(' '))}</div>`
    : '';

  const previewRows = entries
    .map(
      (entry) => `
<li>
  ${ESP.escapeHtml(entry.name)} — L${ESP.escapeHtml(entry.level)}
  ${entry.skillId ? '' : '<span class="negative">(unresolved)</span>'}
</li>
`
    )
    .join('');

  return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Add Skill Plan from Clipboard</h2>

    <div class="form-row">
      <label>
        <input
          type="radio"
          name="planScope"
          value="global"
          ${addPlanState.scope === 'global' ? 'checked' : ''}
        />
        Add to all characters
      </label>

      <label>
        <input
          type="radio"
          name="planScope"
          value="character"
          ${addPlanState.scope === 'character' ? 'checked' : ''}
        />
        Add to specific character
      </label>
    </div>

    ${
      addPlanState.scope === 'character'
        ? `
<div class="form-row">
  <label for="planCharacterSelect">Character</label>
  <select id="planCharacterSelect">
    ${characterOptions}
  </select>
</div>
`
        : ''
    }

    <div class="form-row">
      <label for="planNameInput">Plan name</label>
      <input
        id="planNameInput"
        type="text"
        value="${ESP.escapeHtml(addPlanState.name)}"
        placeholder="Enter plan name"
      />
    </div>

    <div class="form-row">
      <strong>${entries.length}</strong> skills found.
      ${unknownCount ? `<span class="negative">${unknownCount} unresolved.</span>` : ''}
    </div>

    ${errorsHtml}

    <div class="plan-preview">
      <ul>
        ${previewRows}
      </ul>
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-cancel">Cancel</button>
      <button type="button" class="modal-save">Save plan</button>
    </div>
  </div>
</div>
`;
};
ESP.planDetailModalHtml = function (plan) {
  const entries = Array.isArray(plan.entries) ? plan.entries : [];

  const rows = entries
    .map(
      (entry) => `
<li>
  ${ESP.escapeHtml(entry.name)} — L${ESP.escapeHtml(entry.level)}
</li>
`
    )
    .join('');

  return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>${ESP.escapeHtml(plan.name)}</h2>

    <div class="form-row">
      ${plan.scope === 'global' ? 'All characters' : 'Character-specific'}
      · ${entries.length} skills
    </div>

    <div class="plan-preview">
      <ul>
        ${rows}
      </ul>
    </div>
  </div>
</div>
`;
};

ESP.settingsModalHtml = function (settings) {
  const importEnabled = !settings || settings.importEnabled !== false;
  const hidePrimary = Boolean(settings && settings.hidePrimaryWhenCollapsed);
  const openAtLogin = Boolean(settings && settings.openAtLogin);
  const muteSounds = Boolean(settings && settings.muteSounds);
  const notifySkill = !settings || settings.notifySkill !== false;
  const notifyWallet = !settings || settings.notifyWallet !== false;
  const startMinimized = Boolean(settings && settings.startMinimized);
  const threshold = Number((settings && settings.walletNotifyThreshold) || 0);

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

ESP.groupModalHtml = function () {
  const groupState = ESP.state.groupState;

  return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Account Group</h2>

    <div class="form-row">
      <label for="groupNameInput">Group name (leave empty to ungroup)</label>
      <input
        id="groupNameInput"
        type="text"
        value="${ESP.escapeHtml(groupState.name || '')}"
        placeholder="e.g. Main account"
      />
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-cancel">Cancel</button>
      <button type="button" class="modal-save">Save group</button>
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

ESP.openGroupModal = function (characterId, currentName) {
  ESP.state.groupState = {
    characterId,
    name: currentName || ''
  };

  ESP.renderModals();
};

ESP.saveGroupModal = async function () {
  const groupState = ESP.state.groupState;

  if (!groupState) return;

  const modalRoot = ESP.getModalRoot();
  const saveBtn = modalRoot ? modalRoot.querySelector('.modal-save') : null;

  if (saveBtn) {
    saveBtn.disabled = true;
  }

  try {
    await window.eveApi.setGroup(
      groupState.characterId,
      groupState.name || ''
    );

    ESP.state.groupState = null;

    await ESP.loadGroups();
    ESP.render(ESP.state.lastAccounts);
    ESP.setStatus('Account group saved.');
    ESP.renderModals();
  } catch (err) {
    ESP.setStatus(err?.message || String(err), true);

    if (saveBtn) {
      saveBtn.disabled = false;
    }
  }
};
ESP.openAddPlanModal = async function () {
  if (!window.eveApi || !window.eveApi.readClipboardPlan) {
    ESP.setStatus('Clipboard plans are not available.', true);
    return;
  }

  ESP.state.addPlanState = {
    status: 'loading',
    error: '',
    entries: [],
    errors: [],
    scope: 'global',
    characterId: ESP.state.lastAccounts.length
      ? String(ESP.state.lastAccounts[0].characterId)
      : '',
    name: ''
  };

  ESP.renderModals();

  try {
    const result = await window.eveApi.readClipboardPlan();

    ESP.state.addPlanState = {
      ...ESP.state.addPlanState,
      status: 'ready',
      entries: result.entries || [],
      errors: result.errors || []
    };
  } catch (err) {
    const message = err?.message || String(err);

    ESP.state.addPlanState = {
      ...ESP.state.addPlanState,
      status: /no valid skill lines/i.test(message) ? 'empty' : 'error',
      error: message
    };
  }

  ESP.renderModals();
};

ESP.saveAddPlanModal = async function () {
  const addPlanState = ESP.state.addPlanState;

  if (!addPlanState || addPlanState.status !== 'ready') {
    return;
  }

  const modalRoot = ESP.getModalRoot();
  const saveBtn = modalRoot ? modalRoot.querySelector('.modal-save') : null;

  if (saveBtn) {
    saveBtn.disabled = true;
  }

  try {
    const name = String(addPlanState.name || '').trim();

    if (!name) {
      if (saveBtn) saveBtn.disabled = false;
      ESP.setStatus('Enter a plan name.', true);
      return;
    }

    if (addPlanState.scope === 'character' && !addPlanState.characterId) {
      if (saveBtn) saveBtn.disabled = false;
      ESP.setStatus('Select a character for this plan.', true);
      return;
    }

    await window.eveApi.savePlan({
      name,
      scope: addPlanState.scope,
      characterId:
        addPlanState.scope === 'character'
          ? Number(addPlanState.characterId)
          : null,
      entries: addPlanState.entries
    });

    ESP.state.addPlanState = null;

    if (typeof ESP.loadPlans === 'function') {
      await ESP.loadPlans();
    }

    ESP.setStatus('Skill plan saved.');

    if (typeof ESP.render === 'function') {
      ESP.render(ESP.state.lastAccounts);
    } else {
      ESP.renderModals();
    }
  } catch (err) {
    ESP.setStatus(err?.message || String(err), true);

    if (saveBtn) {
      saveBtn.disabled = false;
    }
  }
};
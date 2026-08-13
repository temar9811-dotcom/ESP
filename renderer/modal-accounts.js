'use strict';

window.ESP = window.ESP || {};

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

ESP.addCharacterModalHtml = function () {
  const scope = (ESP.state.addCharacter || {}).scope || 'future';

  return `
<div class="modal-overlay">
  <div class="modal-card">
    <button type="button" class="modal-close" title="Close">✕</button>
    <h2>Add Character</h2>

    <div class="form-row">
      <label style="display:flex; align-items:flex-start; gap:8px;">
        <input
          type="radio"
          name="addScope"
          value="future"
          ${scope === 'future' ? 'checked' : ''}
        />
        <span>
          <strong>Full access (recommended)</strong><br />
          Grants every scope ESP may ever use — contracts, industry, PI,
          assets and markets. You will never need to re-login when new
          features arrive.
        </span>
      </label>
    </div>

    <div class="form-row">
      <label style="display:flex; align-items:flex-start; gap:8px;">
        <input
          type="radio"
          name="addScope"
          value="essential"
          ${scope === 'essential' ? 'checked' : ''}
        />
        <span>
          <strong>Essential only</strong><br />
          Minimum scopes for current features (skills, wallet, location,
          online status). You will need to re-add this character when new
          features require more scopes.
        </span>
      </label>
    </div>

    <div class="modal-actions">
      <button type="button" class="modal-cancel">Cancel</button>
      <button type="button" class="add-character-save">Log in with EVE</button>
    </div>
  </div>
</div>
`;
};

ESP.openAddCharacterModal = function () {
  ESP.state.addCharacter = { scope: 'future' };
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
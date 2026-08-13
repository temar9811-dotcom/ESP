'use strict';

window.ESP = window.ESP || {};

ESP.spForLevel = function (rank, level) {
  const r = Number(rank || 1);
  const l = Number(level || 1);
  const base = 250 * r;
  const sqrt32 = Math.sqrt(32);

  if (l <= 1) return Math.round(base);
  if (l === 2) return Math.round(base * sqrt32);
  if (l === 3) return Math.round(base * 32);
  if (l === 4) return Math.round(base * 32 * sqrt32);
  return Math.round(base * 1024);
};

ESP.formatSpTime = function (sp) {
  const totalMinutes = Math.round((Number(sp) / 1800) * 60);

  if (totalMinutes < 60) return `${totalMinutes}m`;

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  return `${hours}h ${minutes}m`;
};

ESP.planSpInfo = function (entry, meta) {
  const skillMeta = entry && entry.skillId ? (meta || {})[entry.skillId] : null;

  if (!skillMeta) return null;

  const sp = ESP.spForLevel(skillMeta.rank, entry.level);

  return {
    sp,
    time: ESP.formatSpTime(sp)
  };
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
  const meta = addPlanState.meta || {};

  let totalSp = 0;

  const previewRows = entries
    .map((entry) => {
      const info = ESP.planSpInfo(entry, meta);

      if (info) totalSp += info.sp;

      const infoHtml = info
        ? ` <span style="color:#9fb3c8;">· ${ESP.formatNumber(info.sp)} SP · ~${info.time}</span>`
        : '';

      return `
<li>
  ${ESP.escapeHtml(entry.name)} — L${ESP.escapeHtml(entry.level)}${infoHtml}
  ${entry.skillId ? '' : '<span class="negative">(unresolved)</span>'}
</li>
`;
    })
    .join('');

  const totalHtml = totalSp
    ? `
<div class="form-row">
  <strong>Total:</strong> ${ESP.formatNumber(totalSp)} SP · ~${ESP.formatSpTime(totalSp)} @ 1800 SP/h
</div>
`
    : '';

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

    ${totalHtml}

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
  const meta = plan.meta || {};

  let totalSp = 0;

  const rows = entries
    .map((entry) => {
      const info = ESP.planSpInfo(entry, meta);

      if (info) totalSp += info.sp;

      const infoHtml = info
        ? ` <span style="color:#9fb3c8;">· ${ESP.formatNumber(info.sp)} SP · ~${info.time}</span>`
        : '';

      return `
<li>
  ${ESP.escapeHtml(entry.name)} — L${ESP.escapeHtml(entry.level)}${infoHtml}
</li>
`;
    })
    .join('');

  const totalHtml = totalSp
    ? `
<div class="form-row">
  <strong>Total:</strong> ${ESP.formatNumber(totalSp)} SP · ~${ESP.formatSpTime(totalSp)} @ 1800 SP/h
</div>
`
    : '';

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

    ${totalHtml}
  </div>
</div>
`;
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
    name: '',
    meta: {}
  };

  ESP.renderModals();

  try {
    const result = await window.eveApi.readClipboardPlan();

    const ids = (result.entries || [])
      .map((entry) => entry.skillId)
      .filter(Boolean);

    let meta = {};

    if (ids.length && window.eveApi.getSkillMeta) {
      try {
        meta = await window.eveApi.getSkillMeta(ids);
      } catch {
        meta = {};
      }
    }

    ESP.state.addPlanState = {
      ...ESP.state.addPlanState,
      status: 'ready',
      entries: result.entries || [],
      errors: result.errors || [],
      meta
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
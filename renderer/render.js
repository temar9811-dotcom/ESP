'use strict';

window.ESP = window.ESP || {};

ESP.activeHtml = function (account) {
  const active = account.activeSkill;

  if (!active) {
    return '<div class="idle">No active skill training</div>';
  }

  const percent = ESP.progressPercent(active);

  return `
<div class="active">
  <div>
    <strong>Training:</strong>
    ${ESP.escapeHtml(active.skillName || 'Unknown')} L${ESP.escapeHtml(active.finished_level ?? '?')}
  </div>
  <div>
    <strong>Finishes:</strong>
    ${ESP.formatDate(active.finish_date)} (${ESP.remaining(active.finish_date)})
  </div>
  <div class="bar">
    <div class="bar-fill" style="width:${percent}%"></div>
  </div>
</div>
`;
};

ESP.nextSkillHtml = function (account) {
  const next = account.nextSkill;

  if (!next) {
    return '<div class="idle">No next skill in queue</div>';
  }

  const spCostHtml =
    next.spCost == null
      ? ''
      : `<div><strong>SP cost:</strong> ${ESP.formatNumber(next.spCost)}</div>`;

  return `
<div class="active">
  <div>
    <strong>Next in queue:</strong>
    ${ESP.escapeHtml(next.skillName || 'Unknown')} L${ESP.escapeHtml(next.finished_level ?? '?')}
  </div>
  <div>
    <strong>Queue position:</strong>
    ${ESP.escapeHtml(next.queue_position ?? '')}
  </div>
  <div>
    <strong>Start:</strong>
    ${ESP.formatDate(next.start_date) || '—'}
  </div>
  <div>
    <strong>Finish:</strong>
    ${ESP.formatDate(next.finish_date) || '—'} (${ESP.remaining(next.finish_date) || '—'})
  </div>
  ${spCostHtml}
</div>
`;
};

ESP.overviewHtml = function (account) {
  return `
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Total Skill Points</div>
    <div class="stat-value">${ESP.formatOptionalNumber(account.totalSp)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Total Queue Time</div>
    <div class="stat-value">${ESP.formatDuration(account.queueTotalTimeMs)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Queue Time Remaining</div>
    <div class="stat-value">${ESP.formatDuration(account.queueRemainingMs)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Wallet</div>
    <div class="stat-value">${ESP.formatIsk(account.wallet)} ISK</div>
  </div>
</div>
${ESP.activeHtml(account)}
${ESP.nextSkillHtml(account)}
${ESP.recentSkillsHtml(account)}
`;
};

ESP.queueHtmlFull = function (account) {
  const queue = Array.isArray(account.queue) ? account.queue : [];

  if (!queue.length) {
    return '<div class="idle">Skill queue is empty</div>';
  }

  const rows = queue
    .slice(0, 100)
    .map(
      (q) => `
<tr>
  <td>${ESP.escapeHtml(q.queue_position ?? '')}</td>
  <td>${ESP.escapeHtml(q.skillName || 'Unknown')}</td>
  <td>${ESP.escapeHtml(q.finished_level ?? '')}</td>
  <td>${ESP.formatDate(q.start_date) || '—'}</td>
  <td>${ESP.formatDate(q.finish_date) || '—'}</td>
  <td>${ESP.remaining(q.finish_date) || '—'}</td>
  <td>${q.spCost == null ? '—' : ESP.formatNumber(q.spCost)}</td>
</tr>
`
    )
    .join('');

  return `
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Skill</th>
        <th>Level</th>
        <th>Start</th>
        <th>Finish</th>
        <th>Remaining</th>
        <th>SP Cost</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="6"><strong>Total queue SP cost</strong></td>
        <td><strong>${ESP.formatOptionalNumber(account.queueTotalSpCost)}</strong></td>
      </tr>
    </tfoot>
  </table>
</div>
`;
};

ESP.skillQueueTabHtml = function (account) {
  const completedPlans = ESP.completedPlansForAccount(account);

  const banner = completedPlans.length
    ? `
<div class="plan-completed-banner">
  This queue completes: ${completedPlans
    .map((plan) => ESP.escapeHtml(plan.name))
    .join(', ')}
</div>
`
    : '';

  return `
${banner}
<div class="skill-tab-toolbar">
  <button
    type="button"
    id="skillSearchTab"
    class="skill-search-tab-btn"
  >Skill Search</button>
</div>
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Total Queue SP Cost</div>
    <div class="stat-value">${ESP.formatOptionalNumber(account.queueTotalSpCost)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Queue Entries</div>
    <div class="stat-value">${Array.isArray(account.queue) ? account.queue.length : 0}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Total Queue Time</div>
    <div class="stat-value">${ESP.formatDuration(account.queueTotalTimeMs)}</div>
  </div>
</div>
${ESP.queueHtmlFull(account)}
${ESP.allSkillsHtml(account)}
`;
};

ESP.allSkillsHtml = function (account) {
  const id = Number(account.characterId);
  const slot = (ESP.state.allSkillsByCharacter || {})[id];

  // A slot with data renders immediately, whatever its status — the
  // loading message only appears when the cache has nothing yet.
  if (!slot || !slot.data) {
    if (!slot) {
      ESP.loadAllSkills(id);
    }

    if (slot && slot.status === 'error') {
      return `
<div class="skills-list-empty">
  Failed to load skills: ${ESP.escapeHtml(slot.error || 'Unknown error')}
  <button type="button" class="skills-retry" data-id="${id}">Retry</button>
</div>
`;
    }

    return `<div class="skills-list-empty">Loading skills…</div>`;
  }

  const data = slot.data || {};

  if (!data.cached) {
    return `
<div class="skills-list-empty">
  ${
    data.pulling
      ? 'Initial skills pull in progress — skills will appear here shortly.'
      : 'No skills data cached yet.'
  }
  <button type="button" class="skills-retry" data-id="${id}">Retry</button>
</div>
`;
  }

  // Skill groups are collapsed by default; the user expands them.
  const collapseState = (ESP.state.skillGroupsCollapse || {})[id] || {
    all: true,
    overrides: {}
  };

  const groupsHtml = (data.groups || [])
    .map((group) => {
      const isCollapsed =
        collapseState.overrides[group.id] != null
          ? collapseState.overrides[group.id]
          : collapseState.all;

      const rows = isCollapsed
        ? ''
        : `
<div class="skill-group-rows">
  ${group.skills
    .map(
      (skill) => `
  <div class="skill-row">
    <span class="skill-row-name">${ESP.escapeHtml(skill.name)}</span>
    <span class="skill-row-level">Level ${skill.level}</span>
    <span class="skill-row-sp">${ESP.formatOptionalNumber(skill.sp)} SP</span>
  </div>`
    )
    .join('')}
</div>`;

      return `
<div class="skill-group">
  <div
    class="skill-group-header"
    data-id="${id}"
    data-group-id="${group.id}"
    role="button"
    tabindex="0"
  >
    <span class="skill-group-chevron">${isCollapsed ? '▸' : '▾'}</span>
    <span class="skill-group-name">${ESP.escapeHtml(group.name)}</span>
    <span class="skill-group-count">${group.skills.length}</span>
  </div>
  ${rows}
</div>`;
    })
    .join('');

  return `
<div class="skills-section">
  <div class="skills-toolbar">
    <button
      type="button"
      class="skills-collapse-all ${collapseState.all ? 'is-collapsed' : ''}"
      data-id="${id}"
      title="${collapseState.all ? 'Expand all skill groups' : 'Collapse all skill groups'}"
      aria-label="${collapseState.all ? 'Expand all skill groups' : 'Collapse all skill groups'}"
    >${collapseState.all ? '▸' : '▾'}</button>
    <span class="skills-toolbar-label">All Skills · ${data.groups.length} groups</span>
  </div>
  <div class="skills-groups">
    ${groupsHtml}
  </div>
</div>
`;
};

ESP.amountHtml = function (amount) {
  const value = Number(amount || 0);
  const className = value >= 0 ? 'positive' : 'negative';
  const sign = value >= 0 ? '+' : '-';

  return `<span class="${className}">${sign}${ESP.formatIsk(Math.abs(value))}</span>`;
};

// Journal entries and transactions render in their own vertically
// stacked boxes. Each box shows the newest 10 entries; the list scrolls
// for older ones.
ESP.walletBoxHtml = function (title, entries, rowHtml) {
  const visible = entries.slice(0, 500);

  const rows = visible.length
    ? visible.map(rowHtml).join('')
    : `<div class="wallet-empty">No entries in the last 7 days.</div>`;

  return `
<div class="wallet-box">
  <div class="wallet-box-header">
    <span>${ESP.escapeHtml(title)}</span>
    <span class="wallet-box-count">${ESP.formatNumber(entries.length)}</span>
  </div>
  <div class="wallet-box-list">
${rows}
  </div>
</div>
`;
};

ESP.walletTabHtml = function (account) {
  const id = Number(account.characterId);
  const state = ESP.state.walletState[id];

  // A state with data renders immediately, whatever its status — the
  // loading message only appears when the cache has nothing yet.
  if (!state || !state.data) {
    if (state && state.status === 'error') {
      return `
<div class="error">${ESP.escapeHtml(state.error || 'Failed to load wallet details.')}</div>
<button class="wallet-retry" data-id="${id}">Retry</button>
`;
    }

    return '<div class="idle">Loading wallet details...</div>';
  }

  const data = state.data;

  if (!Array.isArray(data.entries) || !data.entries.length) {
    return '<div class="idle">No wallet activity in the last 7 days.</div>';
  }

  const summary = data.summary || {};

  const journal = data.entries.filter((entry) => entry.kind === 'journal');
  const transactions = data.entries.filter((entry) => entry.kind === 'transaction');

  const journalBox = ESP.walletBoxHtml('Journal Entries', journal, (entry) => `
<div class="wallet-row">
  <div class="wallet-row-main">
    <span class="wallet-row-desc">${ESP.escapeHtml(entry.description)}</span>
    <span class="wallet-row-sub">${ESP.escapeHtml(entry.category || '')}${entry.party ? ` · ${ESP.escapeHtml(entry.party)}` : ''}</span>
  </div>
  <div class="wallet-row-side">
    ${ESP.amountHtml(entry.amount)}
    <span class="wallet-row-sub">${ESP.formatDate(entry.date)}${entry.balance == null ? '' : ` · ${ESP.formatIsk(entry.balance)}`}</span>
  </div>
</div>
`);

  const transactionsBox = ESP.walletBoxHtml('Transactions', transactions, (entry) => `
<div class="wallet-row">
  <div class="wallet-row-main">
    <span class="wallet-row-desc">${ESP.escapeHtml(entry.description)}</span>
    <span class="wallet-row-sub">${ESP.escapeHtml(entry.party || '')} @ ${ESP.formatIsk(entry.unitPrice)}</span>
  </div>
  <div class="wallet-row-side">
    ${ESP.amountHtml(entry.amount)}
    <span class="wallet-row-sub">${ESP.formatDate(entry.date)}</span>
  </div>
</div>
`);

  return `
<div class="stats-grid">
  <div class="stat-card">
    <div class="stat-label">Entries</div>
    <div class="stat-value">${ESP.formatNumber(summary.count || 0)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">ISK In</div>
    <div class="stat-value positive">${ESP.formatIsk(summary.moneyIn || 0)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">ISK Out</div>
    <div class="stat-value negative">${ESP.formatIsk(summary.moneyOut || 0)}</div>
  </div>
  <div class="stat-card">
    <div class="stat-label">Net</div>
    <div class="stat-value ${Number(summary.net || 0) >= 0 ? 'positive' : 'negative'}">
      ${ESP.formatIsk(summary.net || 0)}
    </div>
  </div>
</div>
${journalBox}
${transactionsBox}
`;
};

ESP.planBoxHtml = function (account, plan) {
  const trainedDone = ESP.planTrainedSatisfied(account, plan);
  const queueDone = ESP.planIsSatisfied(account, plan);

  let boxClass = 'plan-box';

  if (trainedDone) {
    boxClass += ' plan-done-red';
  } else if (queueDone) {
    boxClass += ' plan-glow';
  }

  const scopeLabel =
    plan.scope === 'global' ? 'All characters' : 'Character-specific';

  return `
<div class="${boxClass}" data-plan-id="${ESP.escapeHtml(plan.id)}">
  <div class="plan-box-name">
    ${ESP.escapeHtml(plan.name)}
  </div>
  <div class="plan-box-meta">
    ${scopeLabel} · ${Array.isArray(plan.entries) ? plan.entries.length : 0} skills
  </div>
  <button type="button" class="plan-delete" data-plan-id="${ESP.escapeHtml(plan.id)}">
    Delete
  </button>
</div>
`;
};

ESP.skillPlansTabHtml = function (account) {
  const applicablePlans = ESP.state.plans.filter((plan) =>
    ESP.planAppliesToAccount(plan, account)
  );

  if (!applicablePlans.length) {
    return `
<div class="idle">
  No skill plans available for this character yet.<br /><br />
  Use <strong>Add plan from clipboard</strong> at the top to create one.
</div>
`;
  }

  return `
<div class="plans-grid">
  ${applicablePlans.map((plan) => ESP.planBoxHtml(account, plan)).join('')}
</div>
`;
};

ESP.PRIMARY_TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'queue', label: 'Skills' },
  { id: 'wallet', label: 'Wallet' },
  { id: 'plans', label: 'Skill Plan' },
  { id: 'assets', label: 'Assets' },
  { id: 'notes', label: 'Notes' }
];

ESP.primaryTabsHtml = function () {
  const activeTab = ESP.getActiveTab();

  const buttons = ESP.PRIMARY_TABS.map(
    (tab) => `
  <button
    type="button"
    role="tab"
    aria-selected="${activeTab === tab.id}"
    class="primary-tab ${activeTab === tab.id ? 'active' : ''}"
    data-tab="${tab.id}"
  >
    ${tab.label}
  </button>`
  ).join('');

  return `
<nav class="primary-tabs" role="tablist">
${buttons}
</nav>
`;
};

ESP.tabContentHtml = function (account, activeTab) {
  if (activeTab === 'queue') {
    return ESP.skillQueueTabHtml(account);
  }

  if (activeTab === 'wallet') {
    return ESP.walletTabHtml(account);
  }

  if (activeTab === 'plans') {
    return ESP.skillPlansTabHtml(account);
  }

  if (activeTab === 'assets') {
    return typeof ESP.assetsTabHtml === 'function'
      ? ESP.assetsTabHtml(account)
      : ESP.clonesTabHtml(account);
  }

  if (activeTab === 'notes') {
    return ESP.notesTabHtml(account);
  }

  return ESP.overviewHtml(account);
};

ESP.groupHeaderHtml = function (name, count, collapsed) {
  return `
<div
  class="group-header"
  data-group="${ESP.escapeHtml(name)}"
  style="display:flex; justify-content:space-between; align-items:center; margin:14px 0 6px; padding:6px 10px; background:rgba(90,140,190,0.12); border:1px solid rgba(90,140,190,0.3); border-radius:8px; cursor:pointer; font-weight:700;"
>
  <span>${ESP.escapeHtml(name)}</span>
  <span style="font-weight:400; font-size:12px; color:#9fb3c8;">
    ${count} character${count === 1 ? '' : 's'} ${collapsed ? '▸' : '▾'}
  </span>
</div>
`;
};

ESP.characterSheetHtml = function (account, opts = {}) {
  const activeTab = ESP.getActiveTab();

  const corpInfo =
    (ESP.state.corpInfoByCharacter || {})[account.characterId] || {};

  const corpLine = corpInfo.loading
    ? 'Loading corporation...'
    : corpInfo.corporation || 'Unknown corporation';

  const allianceLine = corpInfo.loading
    ? ' '
    : corpInfo.alliance || 'No alliance';

  return `
<div class="sheet-header">
  <img
    src="https://images.evetech.net/characters/${account.characterId}/portrait?size=64"
    alt="Character portrait"
  />
  <div class="sheet-title">
    <h2>${ESP.escapeHtml(account.characterName || 'Unknown character')}</h2>
    <div class="wallet">Wallet: ${ESP.formatIsk(account.wallet)} ISK</div>
  </div>
  <div class="sheet-header-center">
    <div class="sheet-location" title="${ESP.escapeHtml(corpLine)}">
      ${ESP.escapeHtml(corpLine)}
    </div>
    <div class="sheet-ship" title="${ESP.escapeHtml(allianceLine)}">
      ${ESP.escapeHtml(allianceLine)}
    </div>
  </div>
  <button
    type="button"
    class="set-group"
    data-id="${account.characterId}"
    title="Set account group for this character"
    style="background:#24313f; color:#cfe0f2; border:1px solid rgba(90,140,190,0.35); border-radius:6px; padding:6px 10px; cursor:pointer; margin-right:8px;"
  >
    Group: ${ESP.escapeHtml(opts.groupName || 'None')}
  </button>
  <button class="remove" data-id="${account.characterId}">Remove</button>
</div>
<div class="sheet-panel">
  ${ESP.tabContentHtml(account, activeTab)}
</div>
`;
};

ESP.characterTabHtml = function (account, opts = {}) {
  const isSelected =
    Number(ESP.state.openCharacterId) === Number(account.characterId);
  const glow = ESP.charGlowClass ? ESP.charGlowClass(account) : '';
  const portrait = `https://images.evetech.net/characters/${account.characterId}/portrait?size=64`;

  const location = account.location || 'Unknown location';
  const shipName = account.shipName || 'Unknown ship';
  const shipType = account.shipType || '';
  const shipDisplay = shipType ? `${shipName} [${shipType}]` : shipName;

  const starHtml = opts.grouped
    ? `
<button
  type="button"
  class="group-star"
  data-id="${account.characterId}"
  title="${opts.primary ? 'Primary character' : 'Make primary character'}"
  style="position:absolute; right:8px; top:8px; background:none; border:none; cursor:pointer; font-size:14px; color:${opts.primary ? '#f5c542' : '#5b708a'}; z-index:2;"
>
  ${opts.primary ? '★' : '☆'}
</button>
`
    : '';

  return `
<section
  class="character-item ${isSelected ? 'selected' : ''} ${glow}"
  data-character-id="${account.characterId}"
  style="position:relative;"
>
  ${starHtml}
  <button
    type="button"
    class="character-tab ${opts.grouped ? 'has-star' : ''}"
    data-id="${account.characterId}"
    aria-pressed="${isSelected}"
  >
    <img class="character-thumb" src="${portrait}" alt="" />
    <span class="character-tab-text">
      <span class="character-name">
        ${ESP.escapeHtml(account.characterName || 'Unknown character')}
      </span>
      <span class="character-sub">
        ${ESP.escapeHtml(ESP.tabSubtitle(account))}
      </span>
      <span class="character-loc">
        <span class="character-loc-line">
          ${ESP.escapeHtml(location)}
        </span>
        <span class="character-ship-line">
          ${ESP.escapeHtml(shipDisplay)}
        </span>
      </span>
    </span>
  </button>
</section>
`;
};

ESP.recentIsOpen = function (account, count) {
  const map = ESP.state.recentOpen || {};
  const id = Number(account.characterId);

  if (map[id] != null) return Boolean(map[id]);

  return count <= 5;
};

ESP.recentSkillsHtml = function (account) {
  const list = Array.isArray(account.recentCompletions)
    ? account.recentCompletions
    : [];

  if (!list.length) return '';

  const id = Number(account.characterId);
  const open = ESP.recentIsOpen(account, list.length);

  const rows = list
    .map(
      (e) => `
<tr>
  <td>${ESP.escapeHtml(e.skillName || 'Unknown')}</td>
  <td>L${ESP.escapeHtml(e.level ?? '')}</td>
  <td>${ESP.formatDate(e.finishedAt)}</td>
</tr>
`
    )
    .join('');

  return `
<div class="recent-skills" style="margin-top:12px;">
  <button
    type="button"
    class="recent-toggle"
    data-id="${id}"
    style="display:flex; justify-content:space-between; align-items:center; width:100%; padding:6px 10px; background:rgba(90,140,190,0.12); border:1px solid rgba(90,140,190,0.3); border-radius:8px; cursor:pointer; font-weight:700; color:inherit;"
  >
    <span>Skills completed in the last 7 days (${list.length})</span>
    <span style="font-weight:400; font-size:12px; color:#9fb3c8;">${open ? '▴' : '▾'}</span>
  </button>
  ${
    open
      ? `
  <div class="table-wrap">
    <table>
      <thead>
        <tr><th>Skill</th><th>Level</th><th>Completed</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>
  `
      : ''
  }
</div>
`;
};

ESP.notesTabHtml = function (account) {
  const id = Number(account.characterId);
  const draftMap = ESP.state.notesDraft || {};
  const value =
    draftMap[id] != null ? draftMap[id] : account.notes || '';

  return `
<div class="notes-wrap">
  <textarea
    class="notes-input"
    data-id="${id}"
    rows="12"
    placeholder="Notes for ${ESP.escapeHtml(account.characterName || 'this character')} — fleet reminders, contracts, things to check..."
    style="width:100%; box-sizing:border-box; background:#1b2430; color:#e8eef5; border:1px solid rgba(90,140,190,0.35); border-radius:8px; padding:10px; font:inherit; resize:vertical;"
  >${ESP.escapeHtml(value)}</textarea>
  <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px;">
    <span style="font-size:12px; color:#9fb3c8;">Saved locally, per character.</span>
    <button
      type="button"
      class="notes-save"
      data-id="${id}"
      style="background:#24313f; color:#cfe0f2; border:1px solid rgba(90,140,190,0.35); border-radius:6px; padding:6px 14px; cursor:pointer;"
    >Save notes</button>
  </div>
</div>
`;
};

ESP.buildSkillIndex = function (accounts, nameMap) {
  const index = new Map();

  for (const account of accounts || []) {
    const charName = account.characterName || `Character ${account.characterId}`;
    const levels = account.skillLevels || {};

    for (const [skillIdStr, level] of Object.entries(levels)) {
      const id = Number(skillIdStr);
      const name = nameMap.get(id) || `Skill ${id}`;

      if (!index.has(id)) {
        index.set(id, { skillId: id, name, characters: [] });
      }

      index.get(id).characters.push({
        characterId: account.characterId,
        characterName: charName,
        level: Number(level) || 0
      });
    }
  }

  for (const entry of index.values()) {
    entry.characters.sort((a, b) =>
      a.characterName.localeCompare(b.characterName)
    );
  }

  return index;
};

ESP.skillSearchPopupHtml = function () {
  const ss = ESP.state.skillSearch;
  if (!ss || !ss.popup) return '';

  const { skillName, results } = ss.popup;

  const rows = results
    .map((r) => {
      const levelStr = r.level === 0 ? 'L0' : `L${r.level}`;
      const cls = r.level === 0 ? 'negative' : '';
      return `
<tr>
  <td>${ESP.escapeHtml(r.characterName)}</td>
  <td class="${cls}">${levelStr}</td>
</tr>`;
    })
    .join('');

  return `
<div class="modal-overlay skill-search-overlay">
  <div class="modal-card skill-search-card">
    <div class="skill-search-header">
      <span class="skill-search-title">${ESP.escapeHtml(skillName)}</span>
      <div class="skill-search-controls">
        <button type="button" class="skill-search-minimize" title="Minimize">_</button>
        <button type="button" class="modal-close" title="Close">\u2715</button>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr><th>Character</th><th>Level</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>
</div>`;
};

ESP.skillSearchPillHtml = function () {
  const ss = ESP.state.skillSearch;
  if (!ss || !ss.minimized || !ss.popup) return '';

  return `
<div class="skill-search-pill" title="Click to restore skill search">
  ${ESP.escapeHtml(ss.popup.skillName)}
</div>`;
};

ESP.clonesTabHtml = function (account) {
  const id = Number(account.characterId);
  const clones = account.clones;

  if (!clones) {
    return '<div class="assets-empty">Loading clone data...</div>';
  }

  if (clones.error) {
    return `<div class="assets-empty">${ESP.escapeHtml(clones.error)}</div>`;
  }

  if (!clones.jumpClones && !clones.activeClone) {
    return '<div class="assets-empty">Clone data unavailable — re-add character with Full scopes.</div>';
  }

  let activeHtml = '';
  const ac = clones.activeClone;

  if (ac && ac.confidence !== 'unknown') {
    const label = ac.confidence === 'uncertain'
      ? `Active: uncertain — last jump ${ESP.formatDate(clones.lastCloneJumpDate)}`
      : `Active: ${ESP.escapeHtml(ac.name || 'Unknown')}${ac.confidence === 'likely' ? ' (likely)' : ''}`;

    activeHtml = `
<div class="active-clone ${ac.confidence === 'uncertain' ? 'active-clone-uncertain' : ''}">
  <div class="active-clone-label">${label}</div>
  ${ac.implants.length
    ? ESP.implantListHtml(ac.implants)
    : '<div class="idle">Implants tracked after the next observed jump</div>'}
  ${ac.implants.length
    ? `<div class="active-clone-value">Total estimated: ${ESP.formatIsk(ac.totalValue)} ISK</div>`
    : ''}
</div>
`;
  } else if (ac && ac.confidence === 'unknown') {
    activeHtml = `
<div class="active-clone">
  <div class="active-clone-label">Active: ${ESP.escapeHtml(ac.name || 'Unknown')}</div>
  <div class="idle">Implants tracked after the next observed jump</div>
</div>
`;
  } else {
    activeHtml = '<div class="active-clone"><div class="idle">Active clone unknown</div></div>';
  }

  const expandState = ESP.state.cloneExpandByCharacter[id] || {};
  const activeCloneId = ac && ac.jumpCloneId;

  const standbyClones = (clones.jumpClones || []).filter((jc) => {
    if (activeCloneId && jc.jumpCloneId === activeCloneId) return false;
    return true;
  });

  let standbyHtml = '';

  if (standbyClones.length === 0) {
    standbyHtml = '<div class="idle">No standby clones</div>';
  } else {
    standbyHtml = standbyClones
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      .map((jc) => {
        const expanded = expandState[jc.jumpCloneId];
        const locDisplay = jc.locationName || `Location ${jc.locationId}`;
        return `
<div class="clone-card">
  <div class="clone-header" data-character-id="${id}" data-clone-id="${jc.jumpCloneId}">
    <span class="clone-expand">${expanded ? '\u25BE' : '\u25B8'}</span>
    <span class="clone-name-wrap">
      <span class="clone-name">${ESP.escapeHtml(jc.nickname || jc.name || jc.locationName || 'Unnamed')}</span>
      <span class="clone-edit-icon" data-character-id="${id}" data-clone-id="${jc.jumpCloneId}" data-current-name="${ESP.escapeHtml(jc.nickname || '')}" title="Edit nickname">&#9998;</span>
    </span>
    <span class="clone-location">${ESP.escapeHtml(locDisplay)}</span>
    <span class="clone-count">${jc.implants.length} implants</span>
    <span class="clone-value">${ESP.formatIsk(jc.totalValue)} ISK</span>
  </div>
  ${expanded ? `<div class="clone-implants">${ESP.implantListHtml(jc.implants)}</div>` : ''}
</div>
`;
      })
      .join('');
  }

  const homeName = clones.homeLocation
    ? (clones.homeLocation.locationName || `Location ${clones.homeLocation.locationId}`)
    : 'Unknown';
  const jumpDate = clones.lastCloneJumpDate
    ? ESP.formatDate(clones.lastCloneJumpDate)
    : 'Never';

  const allClonesTotal = (clones.jumpClones || []).reduce(
    (sum, jc) => sum + (jc.totalValue || 0),
    0
  );

  return `
${activeHtml}
<div class="standby-section">
  <div class="standby-header">Standby Clones</div>
  ${standbyHtml}
</div>
<div class="clone-footer">
  <div>Total clone value: ${ESP.formatIsk(allClonesTotal)} ISK</div>
  <div>Home Location: ${ESP.escapeHtml(homeName)}</div>
  <div>Last clone jump: ${jumpDate}</div>
</div>
`;
};

ESP.implantListHtml = function (implants) {
  if (!implants || !implants.length) return '';

  const sorted = [...implants].sort((a, b) => (a.slot || 99) - (b.slot || 99));

  return `
<table class="implant-table">
  <tbody>
${sorted.map((imp) => `
    <tr>
      <td class="implant-slot">${imp.slot != null ? `[${imp.slot}]` : ''}</td>
      <td class="implant-name">${ESP.escapeHtml(imp.name)}</td>
      <td class="implant-price">${ESP.formatIsk(imp.price)} ISK</td>
    </tr>
`).join('')}
  </tbody>
</table>
`;
};
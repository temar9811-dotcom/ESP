// FILE: renderer/render-queue.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
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
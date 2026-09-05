// FILE: renderer/render-overview.js
// VERSION: 1.1.17-beta
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
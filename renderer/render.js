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
`;
};
ESP.amountHtml = function (amount) {
  const value = Number(amount || 0);
  const className = value >= 0 ? 'positive' : 'negative';
  const sign = value >= 0 ? '+' : '-';

  return `<span class="${className}">${sign}${ESP.formatIsk(Math.abs(value))}</span>`;
};

ESP.walletTabHtml = function (account) {
  const id = Number(account.characterId);
  const state = ESP.state.walletState[id];

  if (!state || state.status === 'idle' || state.status === 'loading') {
    return '<div class="idle">Loading wallet details...</div>';
  }

  if (state.status === 'error') {
    return `
<div class="error">${ESP.escapeHtml(state.error || 'Failed to load wallet details.')}</div>
<button class="wallet-retry" data-id="${id}">Retry</button>
`;
  }

  const data = state.data;

  if (!data || !Array.isArray(data.entries) || !data.entries.length) {
    return '<div class="idle">No wallet activity in the last 7 days.</div>';
  }

  const summary = data.summary || {};

  const rows = data.entries
    .slice(0, 500)
    .map((entry) => {
      const detail =
        entry.kind === 'transaction'
          ? `${ESP.escapeHtml(entry.description)} @ ${ESP.formatIsk(entry.unitPrice)}`
          : ESP.escapeHtml(entry.description);

      return `
<tr>
  <td>${ESP.formatDate(entry.date)}</td>
  <td>${ESP.escapeHtml(entry.category || '')}</td>
  <td>${ESP.escapeHtml(entry.party || '')}</td>
  <td>${detail}</td>
  <td>${ESP.amountHtml(entry.amount)}</td>
  <td>${entry.balance == null ? '—' : ESP.formatIsk(entry.balance)}</td>
</tr>
`;
    })
    .join('');

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
<div class="table-wrap">
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Type</th>
        <th>Party</th>
        <th>Details</th>
        <th>Amount</th>
        <th>Balance</th>
      </tr>
    </thead>
    <tbody>
${rows}
    </tbody>
  </table>
</div>
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

  return ESP.overviewHtml(account);
};
ESP.characterSheetHtml = function (account) {
  const id = Number(account.characterId);
  const activeTab = ESP.getActiveTab(id);

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
  <button class="remove" data-id="${account.characterId}">Remove</button>
</div>
<nav class="sheet-tabs">
  <button
    type="button"
    class="sheet-tab ${activeTab === 'overview' ? 'active' : ''}"
    data-id="${id}"
    data-tab="overview"
  >
    Overview
  </button>
  <button
    type="button"
    class="sheet-tab ${activeTab === 'queue' ? 'active' : ''}"
    data-id="${id}"
    data-tab="queue"
  >
    Skill Queue
  </button>
  <button
    type="button"
    class="sheet-tab ${activeTab === 'wallet' ? 'active' : ''}"
    data-id="${id}"
    data-tab="wallet"
  >
    Wallet
  </button>
  <button
    type="button"
    class="sheet-tab ${activeTab === 'plans' ? 'active' : ''}"
    data-id="${id}"
    data-tab="plans"
  >
    Skill Plans
  </button>
</nav>
<div class="sheet-panel">
  ${ESP.tabContentHtml(account, activeTab)}
</div>
`;
};

ESP.characterTabHtml = function (account) {
  const isOpen = ESP.state.openCharacterId === Number(account.characterId);
  const portrait = `https://images.evetech.net/characters/${account.characterId}/portrait?size=64`;

  const location = account.location || 'Unknown location';
  const shipName = account.shipName || 'Unknown ship';
  const shipType = account.shipType || '';
  const shipDisplay = shipType ? `${shipName} [${shipType}]` : shipName;

  return `
<section
  class="character-item ${isOpen ? 'open' : ''}"
  data-character-id="${account.characterId}"
>
  <button
    type="button"
    class="character-tab"
    data-id="${account.characterId}"
    aria-expanded="${isOpen}"
  >
    <img class="character-thumb" src="${portrait}" alt="" />
    <span class="character-tab-text">
      <span class="character-name">
        ${ESP.escapeHtml(account.characterName || 'Unknown character')}
      </span>
      <span class="character-sub">
        ${ESP.escapeHtml(ESP.tabSubtitle(account))}
      </span>
    </span>
    <span
      class="character-loc"
      style="margin-left:auto; text-align:right; max-width:45%; font-size:12px; line-height:1.3; color:#9fb3c8; overflow:hidden;"
    >
      <span style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
        ${ESP.escapeHtml(location)}
      </span>
      <span style="display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:#7d94ad;">
        ${ESP.escapeHtml(shipDisplay)}
      </span>
    </span>
    <span class="character-chevron">
      ${isOpen ? '▴' : '▾'}
    </span>
  </button>
  <div class="character-dropdown">
    ${ESP.characterSheetHtml(account)}
  </div>
</section>
`;
};
// FILE: renderer/render-wallet.js
// VERSION: 1.1.18-beta
'use strict';
window.ESP = window.ESP || {};

ESP.amountHtml = function (amount) {
  const value = Number(amount || 0);
  const className = value >= 0 ? 'positive' : 'negative';
  const sign = value >= 0 ? '+' : '-';
  return `<span class="${className}">${sign}${ESP.formatIsk(Math.abs(value))}</span>`;
};

ESP.walletBoxHtml = function (title, entries, rowHtml) {
  const visible = entries.slice(0, 500);
  const rows = visible.length ? visible.map(rowHtml).join('') : `<div class="wallet-empty">No entries in the last 7 days.</div>`;
  return `<div class="wallet-box"><div class="wallet-box-header"><span>${ESP.escapeHtml(title)}</span><span class="wallet-box-count">${ESP.formatNumber(entries.length)}</span></div><div class="wallet-box-list">${rows}</div></div>`;
};

ESP.walletTabHtml = function (account) {
  const id = Number(account.characterId);
  const state = ESP.state.walletState[id];
  if (!state || !state.data) {
    if (state && state.status === 'error') return `<div class="error">${ESP.escapeHtml(state.error || 'Failed to load wallet details.')}</div><button class="wallet-retry" data-id="${id}">Retry</button>`;
    return '<div class="idle">Loading wallet details...</div>';
  }
  const data = state.data;
  if (!Array.isArray(data.entries) || !data.entries.length) return '<div class="idle">No wallet activity in the last 7 days.</div>';
  
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
</div>`);
  
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
</div>`);

  return `
<div class="stats-grid">
  <div class="stat-card"><div class="stat-label">Entries</div><div class="stat-value">${ESP.formatNumber(summary.count || 0)}</div></div>
  <div class="stat-card"><div class="stat-label">ISK In</div><div class="stat-value positive">${ESP.formatIsk(summary.moneyIn || 0)}</div></div>
  <div class="stat-card"><div class="stat-label">ISK Out</div><div class="stat-value negative">${ESP.formatIsk(summary.moneyOut || 0)}</div></div>
  <div class="stat-card"><div class="stat-label">Net</div><div class="stat-value ${Number(summary.net || 0) >= 0 ? 'positive' : 'negative'}">${ESP.formatIsk(summary.net || 0)}</div></div>
</div>
${journalBox}
${transactionsBox}`;
};
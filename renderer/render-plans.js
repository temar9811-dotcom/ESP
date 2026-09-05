// FILE: renderer/render-character.js
// VERSION: 1.1.18-beta
'use strict';
window.ESP = window.ESP || {};

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
  const buttons = ESP.PRIMARY_TABS.map((tab) => `
<button type="button" role="tab" aria-selected="${activeTab === tab.id}" class="primary-tab ${activeTab === tab.id ? 'active' : ''}" data-tab="${tab.id}">${tab.label}</button>`).join('');
  return `<nav class="primary-tabs" role="tablist">${buttons}</nav>`;
};

ESP.tabContentHtml = function (account, activeTab) {
  if (activeTab === 'queue') return ESP.skillQueueTabHtml(account);
  if (activeTab === 'wallet') return ESP.walletTabHtml(account);
  if (activeTab === 'plans') return ESP.skillPlansTabHtml(account);
  if (activeTab === 'assets') return typeof ESP.assetsTabHtml === 'function' ? ESP.assetsTabHtml(account) : ESP.clonesTabHtml(account);
  if (activeTab === 'notes') return ESP.notesTabHtml(account);
  return ESP.overviewHtml(account);
};

ESP.groupHeaderHtml = function (name, count, collapsed) {
  return `
<div class="group-header" data-group="${ESP.escapeHtml(name)}" style="display:flex; justify-content:space-between; align-items:center; margin:14px 0 6px; padding:6px 10px; background:rgba(90,140,190,0.12); border:1px solid rgba(90,140,190,0.3); border-radius:8px; cursor:pointer; font-weight:700;">
  <span>${ESP.escapeHtml(name)}</span>
  <span style="font-weight:400; font-size:12px; color:#9fb3c8;">${count} character${count === 1 ? '' : 's'} ${collapsed ? '▸' : '▾'}</span>
</div>`;
};

ESP.characterSheetHtml = function (account, opts = {}) {
  const activeTab = ESP.getActiveTab();
  const corpInfo = (ESP.state.corpInfoByCharacter || {})[account.characterId] || {};
  const corpLine = corpInfo.loading ? 'Loading corporation...' : (corpInfo.corporation || 'Unknown corporation');
  const allianceLine = corpInfo.loading ? ' ' : (corpInfo.alliance || 'No alliance');
  return `
<div class="sheet-header">
  <img src="https://images.evetech.net/characters/${account.characterId}/portrait?size=64" alt="Character portrait" />
  <div class="sheet-title">
    <h2>${ESP.escapeHtml(account.characterName || 'Unknown character')}</h2>
    <div class="wallet">Wallet: ${ESP.formatIsk(account.wallet)} ISK</div>
  </div>
  <div class="sheet-header-center">
    <div class="sheet-location" title="${ESP.escapeHtml(corpLine)}">${ESP.escapeHtml(corpLine)}</div>
    <div class="sheet-ship" title="${ESP.escapeHtml(allianceLine)}">${ESP.escapeHtml(allianceLine)}</div>
  </div>
  <button type="button" class="set-group" data-id="${account.characterId}" title="Set account group for this character" style="background:#24313f; color:#cfe0f2; border:1px solid rgba(90,140,190,0.35); border-radius:6px; padding:6px 10px; cursor:pointer; margin-right:8px;">Group: ${ESP.escapeHtml(opts.groupName || 'None')}</button>
  <button class="remove" data-id="${account.characterId}">Remove</button>
</div>
<div class="sheet-panel">${ESP.tabContentHtml(account, activeTab)}</div>`;
};

ESP.characterTabHtml = function (account, opts = {}) {
  const isSelected = Number(ESP.state.openCharacterId) === Number(account.characterId);
  const glow = ESP.charGlowClass ? ESP.charGlowClass(account) : '';
  const portrait = `https://images.evetech.net/characters/${account.characterId}/portrait?size=64`;
  const location = account.location || 'Unknown location';
  const shipName = account.shipName || 'Unknown ship';
  const shipType = account.shipType || '';
  const shipDisplay = shipType ? `${shipName} [${shipType}]` : shipName;
  const starHtml = opts.grouped ? `<button type="button" class="group-star" data-id="${account.characterId}" title="${opts.primary ? 'Primary character' : 'Make primary character'}" style="position:absolute; right:8px; top:8px; background:none; border:none; cursor:pointer; font-size:14px; color:${opts.primary ? '#f5c542' : '#5b708a'}; z-index:2;">${opts.primary ? '★' : '☆'}</button>` : '';
  
  return `
<section class="character-item ${isSelected ? 'selected' : ''} ${glow}" data-character-id="${account.characterId}" style="position:relative;">
  ${starHtml}
  <button type="button" class="character-tab ${opts.grouped ? 'has-star' : ''}" data-id="${account.characterId}" aria-pressed="${isSelected}">
    <img class="character-thumb" src="${portrait}" alt="" />
    <span class="character-tab-text">
      <span class="character-name">${ESP.escapeHtml(account.characterName || 'Unknown character')}</span>
      <span class="character-sub">${ESP.escapeHtml(ESP.tabSubtitle(account))}</span>
      <span class="character-loc">
        <span class="character-loc-line">${ESP.escapeHtml(location)}</span>
        <span class="character-ship-line">${ESP.escapeHtml(shipDisplay)}</span>
      </span>
    </span>
  </button>
</section>`;
};
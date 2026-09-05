// FILE: renderer/render-clones.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
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
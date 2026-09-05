// FILE: renderer/render-search.js
// VERSION: 1.1.18-beta
'use strict';
window.ESP = window.ESP || {};

ESP.buildSkillIndex = function (accounts, nameMap) {
  const index = new Map();
  for (const account of accounts || []) {
    const charName = account.characterName || `Character ${account.characterId}`;
    const levels = account.skillLevels || {};
    for (const [skillIdStr, level] of Object.entries(levels)) {
      const id = Number(skillIdStr);
      const name = nameMap.get(id) || `Skill ${id}`;
      if (!index.has(id)) index.set(id, { skillId: id, name, characters: [] });
      index.get(id).characters.push({ characterId: account.characterId, characterName: charName, level: Number(level) || 0 });
    }
  }
  for (const entry of index.values()) {
    entry.characters.sort((a, b) => a.characterName.localeCompare(b.characterName));
  }
  return index;
};

ESP.skillSearchPopupHtml = function () {
  const ss = ESP.state.skillSearch;
  if (!ss || !ss.popup) return '';
  const { skillName, results } = ss.popup;
  const rows = results.map((r) => {
    const levelStr = r.level === 0 ? 'L0' : `L${r.level}`;
    const cls = r.level === 0 ? 'negative' : '';
    return `<tr><td>${ESP.escapeHtml(r.characterName)}</td><td class="${cls}">${levelStr}</td></tr>`;
  }).join('');
  return `
<div class="modal-overlay skill-search-overlay">
  <div class="modal-card skill-search-card">
    <div class="skill-search-header">
      <span class="skill-search-title">${ESP.escapeHtml(skillName)}</span>
      <div class="skill-search-controls">
        <button type="button" class="skill-search-minimize" title="Minimize">_</button>
        <button type="button" class="modal-close" title="Close">✕</button>
      </div>
    </div>
    <div class="table-wrap">
      <table><thead><tr><th>Character</th><th>Level</th></tr></thead><tbody>${rows}</tbody></table>
    </div>
  </div>
</div>`;
};

ESP.skillSearchPillHtml = function () {
  const ss = ESP.state.skillSearch;
  if (!ss || !ss.minimized || !ss.popup) return '';
  return `<div class="skill-search-pill" title="Click to restore skill search">${ESP.escapeHtml(ss.popup.skillName)}</div>`;
};
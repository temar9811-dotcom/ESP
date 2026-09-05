// FILE: renderer/render-notes.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
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
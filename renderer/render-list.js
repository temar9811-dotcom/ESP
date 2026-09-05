// FILE: renderer/render-list.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
ESP.render = function (accounts) {
  ESP.state.lastAccounts = Array.isArray(accounts) ? accounts : [];
  const stillExists = ESP.state.lastAccounts.some(
    (account) => Number(account.characterId) === Number(ESP.state.openCharacterId)
  );
  if (!stillExists) {
    ESP.state.openCharacterId = null;
  }
  for (const key of Object.keys(ESP.state.walletState)) {
    const id = Number(key);
    const exists = ESP.state.lastAccounts.some(
      (account) => Number(account.characterId) === id
    );
    if (!exists) {
      delete ESP.state.walletState[id];
    }
  }
  for (const stateMap of [
    ESP.state.allSkillsByCharacter,
    ESP.state.skillGroupsCollapse
  ]) {
    for (const key of Object.keys(stateMap || {})) {
      const id = Number(key);
      const exists = ESP.state.lastAccounts.some(
        (account) => Number(account.characterId) === id
      );
      if (!exists) {
        delete stateMap[id];
      }
    }
  }
  const accountsEl = document.getElementById('accounts');
  if (!accountsEl) return;

  // ROBUST SCROLL CAPTURE:
  // Capture from BOTH the specific scrollable rail and the parent container.
  // This guarantees we catch the scroll position regardless of which element
  // is actually handling the overflow in the current CSS layout.
  const charRail = accountsEl.querySelector('.char-rail');
  const railScroll = charRail ? charRail.scrollTop : 0;
  const accountScroll = accountsEl.scrollTop;

  // Diagnostic log to verify we are capturing a non-zero value when scrolled
  if (railScroll > 0 || accountScroll > 0) {
    console.log('[ESP.render] Captured scroll -> rail:', railScroll, 'accounts:', accountScroll);
  }

  if (!ESP.state.lastAccounts.length) {
    accountsEl.innerHTML = `
<div class="empty">
No characters added yet.<br /><br />
Click <strong>Add character</strong> to log in with EVE SSO.
</div>
`;
    return;
  }

  const groupsData = ESP.state.groups || {};
  const hidePrimary = Boolean(
    (ESP.state.settings || {}).hidePrimaryWhenCollapsed
  );
  const byId = new Map(
    ESP.state.lastAccounts.map((account) => [
      Number(account.characterId),
      account
    ])
  );
  const groupedIds = new Set();
  for (const [groupName, group] of Object.entries(groupsData)) {
    if (groupName === 'ungrouped') continue;
    for (const memberId of group.members || []) {
      groupedIds.add(Number(memberId));
    }
  }

  const defaultCharacterId = (() => {
    for (const [groupName, group] of Object.entries(groupsData)) {
      if (groupName === 'ungrouped') continue;
      const members = (group.members || []).map(Number);
      const candidates = [Number(group.primaryCharacterId), ...members];
      for (const id of candidates) {
        if (id && byId.has(id)) return id;
      }
    }
    return Number(ESP.state.lastAccounts[0].characterId);
  })();

  if (ESP.state.openCharacterId == null) {
    ESP.state.openCharacterId = defaultCharacterId;
    ESP.state.openCharacterAutoDefault = Object.keys(groupsData).length === 0;
  } else if (
    ESP.state.openCharacterAutoDefault &&
    Object.keys(groupsData).length
  ) {
    ESP.state.openCharacterId = defaultCharacterId;
    ESP.state.openCharacterAutoDefault = false;
  }

  const selectedId = Number(ESP.state.openCharacterId);
  let railHtml = '';
  for (const [groupName, group] of Object.entries(groupsData)) {
    if (groupName === 'ungrouped') continue;
    const members = (group.members || [])
      .map((memberId) => byId.get(Number(memberId)))
      .filter(Boolean);
    if (!members.length) continue;
    const primary =
      members.find(
        (member) =>
          Number(member.characterId) === Number(group.primaryCharacterId)
      ) || members[0];
    const orderedMembers = hidePrimary
      ? [primary, ...members.filter((member) => member !== primary)]
      : members;
    const shown = group.collapsed
      ? hidePrimary
        ? []
        : [primary]
      : orderedMembers;
    railHtml += ESP.groupHeaderHtml(
      groupName,
      members.length,
      Boolean(group.collapsed)
    );
    if (shown.length) {
      railHtml += `<div class="char-grid">${shown
        .map((account) =>
          ESP.characterTabHtml(account, {
            grouped: true,
            primary:
              Number(account.characterId) === Number(primary.characterId),
            groupName
          })
        )
        .join('')}</div>`;
    }
  }

  const ungrouped = ESP.state.lastAccounts.filter(
    (account) => !groupedIds.has(Number(account.characterId))
  );
  if (ungrouped.length) {
    const ungroupedCollapsed = Boolean(
      (groupsData.ungrouped || {}).collapsed
    );
    railHtml += `
<div
  class="group-header"
  data-group="__ungrouped__"
  style="display:flex; justify-content:space-between; align-items:center; margin:14px 0 6px; padding:6px 10px; background:rgba(90,140,190,0.12); border:1px solid rgba(90,140,190,0.3); border-radius:8px; cursor:pointer; font-weight:700;"
>
  <span>Ungrouped</span>
  <span style="font-weight:400; font-size:12px; color:#9fb3c8;">
    ${ungrouped.length} character${ungrouped.length === 1 ? '' : 's'} ${ungroupedCollapsed ? '▸' : '▾'}
  </span>
</div>
`;
    if (!ungroupedCollapsed) {
      railHtml += `<div class="char-grid">${ungrouped
        .map((account) => ESP.characterTabHtml(account, { grouped: false }))
        .join('')}</div>`;
    }
  }

  const selected = byId.get(selectedId) || null;
  let selectedGroupName = null;
  if (selected) {
    for (const [groupName, group] of Object.entries(groupsData)) {
      if (groupName === 'ungrouped') continue;
      if ((group.members || []).map(Number).includes(selectedId)) {
        selectedGroupName = groupName;
        break;
      }
    }
  }

  accountsEl.innerHTML = `
${ESP.primaryTabsHtml()}
<div class="layout-body">
  <aside class="char-rail">
${railHtml}
  </aside>
  <section class="content-pane">
${
  selected
    ? ESP.characterSheetHtml(selected, {
        grouped: selectedGroupName != null,
        groupName: selectedGroupName
      })
    : '<div class="idle">Select a character on the left.</div>'
}
  </section>
</div>
`;

  // ROBUST SCROLL RESTORATION:
  // Restore synchronously immediately after innerHTML replacement.
  // We restore BOTH potential scroll containers to guarantee the view is preserved.
  const newCharRail = accountsEl.querySelector('.char-rail');
  if (newCharRail) {
    newCharRail.scrollTop = railScroll;
    console.log('[ESP.render] Restored rail scroll to:', newCharRail.scrollTop);
  }
  accountsEl.scrollTop = accountScroll;

  if (selected) {
    ESP.loadCorpInfo(selectedId);
  }
  if (ESP.state.skillSearch && ESP.state.skillSearch.open) {
    ESP.renderSkillSearch();
  }
  ESP.maybeAutoLoadWallet();
  ESP.maybeAutoLoadAssets();
};
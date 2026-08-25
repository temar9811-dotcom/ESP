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

  const accountsEl = document.getElementById('accounts');
  if (!accountsEl) return;

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
    if (groupName === '__ungrouped__') continue;

    for (const memberId of group.members || []) {
      groupedIds.add(Number(memberId));
    }
  }

  // Keep one character selected at all times so the content pane has context.
  if (ESP.state.openCharacterId == null) {
    ESP.state.openCharacterId = Number(ESP.state.lastAccounts[0].characterId);
  }

  const selectedId = Number(ESP.state.openCharacterId);

  let railHtml = '';

  for (const [groupName, group] of Object.entries(groupsData)) {
    if (groupName === '__ungrouped__') continue;

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
      (groupsData.__ungrouped__ || {}).collapsed
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
      if (groupName === '__ungrouped__') continue;

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

  if (selected) {
    ESP.loadCorpInfo(selectedId);
  }

  ESP.maybeAutoLoadWallet();
  ESP.maybeAutoLoadAssets();
};
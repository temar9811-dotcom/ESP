'use strict';

window.ESP = window.ESP || {};

ESP.state.recentOpen = ESP.state.recentOpen || {};

document.addEventListener('click', (event) => {
  const btn = event.target.closest('.recent-toggle');
  if (!btn) return;

  const id = Number(btn.dataset.id);
  const account = (ESP.state.lastAccounts || []).find(
    (a) => Number(a.characterId) === id
  );

  const count =
    account && Array.isArray(account.recentCompletions)
      ? account.recentCompletions.length
      : 0;

  const currently = ESP.recentIsOpen(account || { characterId: id }, count);

  ESP.state.recentOpen[id] = !currently;
  ESP.render(ESP.state.lastAccounts);
});
'use strict';

window.ESP = window.ESP || {};

ESP.state.refreshState = ESP.state.refreshState || {
  refreshing: false,
  rateLimitedUntil: 0
};

ESP.updateRefreshButton = function () {
  const btn = document.getElementById('refresh');
  if (!btn) return;

  const st = ESP.state.refreshState || {};
  const limitedUntil = Number(st.rateLimitedUntil || 0);
  const limited = limitedUntil > Date.now();

  btn.disabled = Boolean(st.refreshing) || limited;

  if (st.refreshing) {
    btn.textContent = 'Refreshing…';
  } else if (limited) {
    btn.textContent = `Cooling down ${Math.ceil((limitedUntil - Date.now()) / 1000)}s`;
  } else {
    btn.textContent = 'Refresh';
  }
};

ESP.applyRefreshState = function (state) {
  ESP.state.refreshState = state || { refreshing: false, rateLimitedUntil: 0 };
  ESP.updateRefreshButton();
};

ESP.bindRefreshState = function () {
  if (!window.eveApi) return;

  if (window.eveApi.onRefreshState) {
    window.eveApi.onRefreshState((state) => {
      ESP.applyRefreshState(state);
    });
  }

  if (window.eveApi.getRefreshState) {
    window.eveApi
      .getRefreshState()
      .then((state) => ESP.applyRefreshState(state))
      .catch(() => {});
  }

  setInterval(() => {
    ESP.updateRefreshButton();
  }, 1000);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ESP.bindRefreshState());
} else {
  ESP.bindRefreshState();
}
'use strict';

window.ESP = window.ESP || {};

ESP.state.refreshState = ESP.state.refreshState || {
  refreshing: false,
  rateLimitedUntil: 0
};

// Per-section ESI sync state (skills / wallet / assets) from the main
// process — used by the tabs-bar countdown indicator.
ESP.state.syncState = ESP.state.syncState || {
  skills: { pulling: false, nextPullAt: null },
  wallet: { pulling: false, nextPullAt: null },
  assets: { pulling: false, nextPullAt: null }
};

ESP.sequencerRunning = function () {
  const sync = ESP.state.syncState || {};
  return Boolean(
    (ESP.state.refreshState && ESP.state.refreshState.refreshing) ||
      (sync.skills && sync.skills.pulling) ||
      (sync.wallet && sync.wallet.pulling)
  );
};

ESP.updateRefreshButton = function () {
  const btn = document.getElementById('refresh');
  if (!btn) return;

  const st = ESP.state.refreshState || {};
  const limitedUntil = Number(st.rateLimitedUntil || 0);
  const limited = limitedUntil > Date.now();
  const pulling = ESP.sequencerRunning();

  btn.disabled = pulling || limited;

  if (pulling) {
    btn.textContent = 'Pulling…';
  } else if (limited) {
    btn.textContent = `Cooling down ${Math.ceil((limitedUntil - Date.now()) / 1000)}s`;
  } else {
    btn.textContent = 'Refresh';
  }
};

ESP.applyRefreshState = function (state) {
  ESP.state.refreshState = state || { refreshing: false, rateLimitedUntil: 0 };
  ESP.updateRefreshButton();
  ESP.renderSyncIndicator();
};

ESP.applySyncState = function (sync) {
  if (sync) {
    ESP.state.syncState = { ...ESP.state.syncState, ...sync };
  }
  ESP.updateRefreshButton();
  ESP.renderSyncIndicator();
};

ESP.refreshSyncState = function () {
  if (!window.eveApi || !window.eveApi.getSyncState) return Promise.resolve();
  return window.eveApi
    .getSyncState()
    .then((sync) => ESP.applySyncState(sync))
    .catch(() => {});
};

function formatCountdown(ms) {
  if (ms == null || !Number.isFinite(ms)) return '—';
  if (ms <= 0) return 'soon';

  const totalSeconds = Math.ceil(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

// Renders the tabs-bar spinner and its hover popup with the countdown to
// the next skills / wallet / assets ESI pull.
ESP.renderSyncIndicator = function () {
  const wrap = document.getElementById('sync-indicator');
  if (!wrap) return;

  const sync = ESP.state.syncState || {};
  const now = Date.now();
  const anyPulling = ESP.sequencerRunning();

  wrap.classList.toggle('pulling', anyPulling);

  const popup = wrap.querySelector('.sync-popup');
  if (!popup) return;

  const sections = [
    { key: 'skills', label: 'Skills' },
    { key: 'wallet', label: 'Wallet' },
    { key: 'assets', label: 'Assets' }
  ];

  popup.innerHTML = sections
    .map(({ key, label }) => {
      const st = sync[key] || {};
      let value;
      let cls = 'sync-value';

      if (st.pulling) {
        value = 'Pulling…';
        cls += ' now';
      } else if (st.nextPullAt == null) {
        value = 'paused';
      } else {
        value = formatCountdown(Number(st.nextPullAt) - now);
      }

      return `<div class="sync-row"><span class="sync-label">${label}</span><span class="${cls}">${value}</span></div>`;
    })
    .join('');
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

  ESP.refreshSyncState();

  setInterval(() => {
    ESP.updateRefreshButton();
    ESP.renderSyncIndicator();
  }, 1000);

  // Poll the sync state so the countdown timers stay honest even though
  // the pulls run on the main process's own timers.
  setInterval(() => {
    ESP.refreshSyncState();
    if (ESP.refreshSequencerState) ESP.refreshSequencerState();
  }, 5000);
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => ESP.bindRefreshState());
} else {
  ESP.bindRefreshState();
}
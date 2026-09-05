// FILE: renderer/init.js
// VERSION: 1.1.17-beta
'use strict';
window.ESP = window.ESP || {};
ESP.bindEvents = function () {
  ESP.bindModalEvents();
  ESP.bindAccountEvents();
  ESP.bindTopbarEvents();
  ESP.bindSkillSearch();
  ESP.bindAssetsListeners();
};
ESP.startEveTimeClock = function () {
  const eveTimeEl = document.getElementById('eve-time');
  if (!eveTimeEl) return;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'UTC',
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
  function tick() {
    eveTimeEl.textContent = `EVE Time: ${formatter.format(new Date())} UTC`;
  }
  tick();
  setInterval(tick, 1000);
  // Apply saved size preference
  const settings = ESP.state.settings || {};
  if (settings.clockLarge) {
    eveTimeEl.classList.add('clock-large');
  }
  // Toggle size on click
  eveTimeEl.addEventListener('click', async () => {
    const isLarge = eveTimeEl.classList.toggle('clock-large');
    try {
      await window.eveApi.setSettings({ clockLarge: isLarge });
      if (ESP.state.settings) {
        ESP.state.settings.clockLarge = isLarge;
      }
    } catch (err) {
      console.error('[clock] Failed to save preference:', err);
    }
  });
};
ESP.initApp = function () {
  ESP.initToastListeners();
  ESP.bindEvents();
  ESP.startEveTimeClock();
  if (window.eveApi) {
    (async () => {
      await ESP.loadSettings();
      await ESP.loadGroups();
      ESP.load();
      ESP.loadPlans();
    })();
    ESP.loadVersion();
    if (window.eveApi && window.eveApi.testEnabled) {
      window.eveApi.testEnabled()
        .then((enabled) => { ESP.state.testEnabled = Boolean(enabled); })
        .catch(() => {});
    }
  } else {
    ESP.setStatus('Preload failed. Restart the app.', true);
  }
};
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ESP.initApp);
} else {
  ESP.initApp();
}
'use strict';

window.ESP = window.ESP || {};

ESP.bindEvents = function () {
  ESP.bindModalEvents();
  ESP.bindAccountEvents();
  ESP.bindTopbarEvents();
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
  } else {
    ESP.setStatus('Preload failed. Restart the app.', true);
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ESP.initApp);
} else {
  ESP.initApp();
}
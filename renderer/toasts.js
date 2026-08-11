'use strict';

window.ESP = window.ESP || {};

ESP.showToast = function (title, body) {
  if (window.eveApi && window.eveApi.showToast) {
    window.eveApi.showToast(title, body);
    return;
  }

  // Fallback: in-app bubbles if the bridge is unavailable.
  const root = document.getElementById('toast-root');
  if (!root) return;

  const bubble = document.createElement('div');
  bubble.className = 'toast-bubble';
  bubble.innerHTML =
    '<div class="toast-title">' + ESP.escapeHtml(title) + '</div>' +
    '<div class="toast-body">' + ESP.escapeHtml(body) + '</div>';

  root.appendChild(bubble);

  setTimeout(() => {
    bubble.remove();
  }, 8000);
};

ESP.initToastListeners = function () {
  if (window.eveApi && window.eveApi.onSkillCompleted) {
    window.eveApi.onSkillCompleted((payload) => {
      ESP.showToast(
        'Skill complete',
        `${payload.characterName}: ${payload.skillName} L${payload.level} finished training.`
      );
    });
  }

  if (window.eveApi && window.eveApi.onWalletActivity) {
    window.eveApi.onWalletActivity((payload) => {
      const list = Array.isArray(payload.entries) ? payload.entries : [];
      const shown = list.slice(0, 5);

      for (const entry of shown) {
        const amount = Number(entry.amount || 0);
        const sign = amount >= 0 ? '+' : '-';
        ESP.showToast(
          'Wallet activity',
          `${payload.characterName}: ${entry.description} (${sign}${ESP.formatIsk(Math.abs(amount))} ISK)`
        );
      }

      if (list.length > shown.length) {
        ESP.showToast(
          'Wallet activity',
          `${payload.characterName}: ${list.length - shown.length} more wallet entries.`
        );
      }
    });
  }
};
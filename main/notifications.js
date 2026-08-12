'use strict';

const toastWindow = require('./toast-window');

function formatIsk(value) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2
  });
}

function notifySkillCompleted(payload) {
  const safe = payload && typeof payload === 'object' ? payload : {};

  toastWindow.showToast(
    'Skill complete',
    `${safe.characterName || 'Unknown'}: ${safe.skillName || 'Unknown'} L${
      safe.level ?? '?'
    } finished training.`,
    'skill'
  );
}

function notifyWalletActivity(payload) {
  const safe = payload && typeof payload === 'object' ? payload : {};
  const list = Array.isArray(safe.entries) ? safe.entries : [];
  const shown = list.slice(0, 5);

  for (const entry of shown) {
    const amount = Number(entry.amount || 0);
    const sign = amount >= 0 ? '+' : '-';

    toastWindow.showToast(
      'Wallet activity',
      `${safe.characterName || 'Unknown'}: ${entry.description || ''} (${sign}${formatIsk(
        Math.abs(amount)
      )} ISK)`,
      'wallet'
    );
  }

  if (list.length > shown.length) {
    toastWindow.showToast(
      'Wallet activity',
      `${safe.characterName || 'Unknown'}: ${list.length - shown.length} more wallet entries.`,
      'wallet'
    );
  }
}

module.exports = {
  notifySkillCompleted,
  notifyWalletActivity
};
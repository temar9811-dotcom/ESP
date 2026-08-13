'use strict';

const toastWindow = require('./toast-window');
const settings = require('./settings');

function formatIsk(value) {
  return Number(value || 0).toLocaleString('en-US', {
    maximumFractionDigits: 2
  });
}

function formatDuration(ms) {
  const totalMinutes = Math.max(0, Math.round(Number(ms || 0) / 60000));

  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function notifySkillCompleted(payload) {
  const current = settings.getSettings();

  if (current.notifySkill === false) return;

  const safe = payload && typeof payload === 'object' ? payload : {};
  const sound = current.muteSounds ? null : 'skill';

  toastWindow.showToast(
    'Skill complete',
    `${safe.characterName || 'Unknown'}: ${safe.skillName || 'Unknown'} L${safe.level ?? '?'} finished training.`,
    sound
  );
}

function notifyQueueWarning(payload) {
  const current = settings.getSettings();

  if (current.notifyQueueEmpty === false) return;

  const safe = payload && typeof payload === 'object' ? payload : {};
  const sound = current.muteSounds ? null : 'wallet';

  toastWindow.showToast(
    'Queue running dry',
    `${safe.characterName || 'Unknown'}: skill queue ends in ${formatDuration(safe.remainingMs)}.`,
    sound
  );
}

function notifyWalletActivity(payload) {
  const current = settings.getSettings();

  if (current.notifyWallet === false) return;

  const threshold = Math.max(0, Number(current.walletNotifyThreshold || 0));
  const safe = payload && typeof payload === 'object' ? payload : {};

  const list = (Array.isArray(safe.entries) ? safe.entries : []).filter(
    (entry) => Math.abs(Number(entry.amount || 0)) >= threshold
  );

  if (!list.length) return;

  const shown = list.slice(0, 5);
  const sound = current.muteSounds ? null : 'wallet';

  for (const entry of shown) {
    const amount = Number(entry.amount || 0);
    const sign = amount >= 0 ? '+' : '-';

    toastWindow.showToast(
      'Wallet activity',
      `${safe.characterName || 'Unknown'}: ${entry.description || ''} (${sign}${formatIsk(
        Math.abs(amount)
      )} ISK)`,
      sound
    );
  }

  if (list.length > shown.length) {
    toastWindow.showToast(
      'Wallet activity',
      `${safe.characterName || 'Unknown'}: ${list.length - shown.length} more wallet entries.`,
      sound
    );
  }
}

module.exports = {
  notifySkillCompleted,
  notifyQueueWarning,
  notifyWalletActivity
};
'use strict';

const toastWindow = require('./toast-window');
const native = require('./native-notifications');
const settings = require('./settings');
const logger = require('./debug/logger');

function deliver(title, body, sound) {
  if (process.platform === 'win32') {
    logger.debug('NOTIFY', `Toast: ${title}`, { body, sound });
    toastWindow.showToast(title, body, sound);
  } else {
    logger.debug('NOTIFY', `Native: ${title}`, { body, sound });
    native.show(title, body, sound);
  }
}

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

  if (current.notifySkill === false) {
    logger.debug('NOTIFY', 'Skill notification skipped: notifySkill disabled');
    return;
  }

  const safe = payload && typeof payload === 'object' ? payload : {};
  const sound = current.muteSounds ? null : 'skill';

  deliver(
    'Skill complete',
    `${safe.characterName || 'Unknown'}: ${safe.skillName || 'Unknown'} L${safe.level ?? '?'} finished training.`,
    sound
  );
}

function notifyQueueWarning(payload) {
  const current = settings.getSettings();

  if (current.notifyQueueEmpty === false) {
    logger.debug('NOTIFY', 'Queue warning skipped: notifyQueueEmpty disabled');
    return;
  }

  const safe = payload && typeof payload === 'object' ? payload : {};
  const sound = current.muteSounds ? null : 'queue';

  deliver(
    'Queue running dry',
    `${safe.characterName || 'Unknown'}: skill queue ends in ${formatDuration(safe.remainingMs)}.`,
    sound
  );
}

function filterWalletEntries(payload) {
  const current = settings.getSettings();
  const threshold = Math.max(0, Number(current.walletNotifyThreshold || 0));
  const safe = payload && typeof payload === 'object' ? payload : {};
  return {
    enabled: current.notifyWallet !== false,
    threshold,
    entries: (Array.isArray(safe.entries) ? safe.entries : []).filter(
      (entry) => Math.abs(Number(entry.amount || 0)) >= threshold
    )
  };
}

function notifyWalletActivity(payload) {
  const current = settings.getSettings();

  if (current.notifyWallet === false) {
    logger.debug('NOTIFY', 'Wallet notification skipped: notifyWallet disabled');
    return;
  }

  const { entries: list } = filterWalletEntries(payload);

  if (!list.length) {
    logger.debug('NOTIFY', 'Wallet notification skipped: no entries above threshold');
    return;
  }

  const shown = list.slice(0, 5);
  const sound = current.muteSounds ? null : 'wallet';

  for (const entry of shown) {
    const amount = Number(entry.amount || 0);
    const sign = amount >= 0 ? '+' : '-';

    deliver(
      'Wallet activity',
      `${payload?.characterName || 'Unknown'}: ${entry.description || ''} (${sign}${formatIsk(
        Math.abs(amount)
      )} ISK)`,
      sound
    );
  }

  if (list.length > shown.length) {
    deliver(
      'Wallet activity',
      `${payload?.characterName || 'Unknown'}: ${list.length - shown.length} more wallet entries.`,
      sound
    );
  }
}

module.exports = {
  formatDuration,
  filterWalletEntries,
  notifySkillCompleted,
  notifyQueueWarning,
  notifyWalletActivity
};
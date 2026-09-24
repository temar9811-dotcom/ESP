// main.js
// VERSION: 1.4
'use strict';
const { app } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
const eveConfig = require('./eve/config');
const eve = require('./eve');
const windowTray = require('./main/window-tray');
const accounts = require('./main/accounts');
const ipc = require('./main/ipc');
const toastWindow = require('./main/toast-window');
const notifications = require('./main/notifications');
const notificationHistory = require('./main/notification-history');
const settingsMod = require('./main/settings');
const logger = require('./main/debug/logger');
const debugEngine = require('./main/debug/engine');
const scheduler = require('./main/scheduler');
const esiStatus = require('./main/esi/status');
const updater = require('./main/updater'); // FIXED: Path corrected to ./main/updater

function sendToRenderer(channel, payload) {
  const win = windowTray.getWindow();
  if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
}

function onAccountsBroadcast(publicAccounts) {
  sendToRenderer('accounts-updated', publicAccounts);
  windowTray.setTooltipAccounts(accounts.getAccounts());
}

function onSkillCompleted(payload) {
  const p = payload || {};
  notificationHistory.record(p.characterId, 'skill-complete', {
    title: 'Skill complete',
    message: `${p.skillName || 'Unknown'} L${p.level ?? '?'} finished training.`,
    skillName: p.skillName,
    level: p.level,
    characterName: p.characterName
  });
  notifications.notifySkillCompleted(payload);
  sendToRenderer('notification:skill-complete', payload || {});
  require('./main/snapshots').broadcastSnapshot(p.characterId);
}

function onQueueWarning(payload) {
  const p = payload || {};
  notificationHistory.record(p.characterId, 'queue-warning', {
    title: 'Queue running dry',
    message: `skill queue ends in ${notifications.formatDuration(p.remainingMs)}.`,
    remainingMs: p.remainingMs,
    characterName: p.characterName
  });
  notifications.notifyQueueWarning(payload);
  sendToRenderer('notification:queue-warning', payload || {});
}

function onQueueEmpty(payload) {
  const p = payload || {};
  notificationHistory.record(p.characterId, 'queue-empty', {
    title: 'Queue empty',
    message: 'skill queue has no skills left.',
    characterName: p.characterName
  });
  sendToRenderer('notification:queue-empty', payload || {});
}

function onWalletActivity(payload) {
  const p = payload || {};
  const { enabled, entries } = notifications.filterWalletEntries(payload);
  const filtered = [...entries];

  if (filtered.length) {
    notificationHistory.record(p.characterId, 'wallet-activity', {
      title: 'Wallet activity',
      message: filtered.length === 1
        ? (filtered[0].description || 'New wallet entry')
        : `${filtered[0].description || 'New wallet entry'} (+${filtered.length - 1} more)`,
      amount: filtered[0].amount ?? null,
      description: filtered[0].description || null,
      characterName: p.characterName
    });
  }

  if (enabled) notifications.notifyWalletActivity({ ...p, entries: filtered });
  if (filtered.length) sendToRenderer('notification:wallet-activity', { ...p, entries: filtered });
}
function onRefreshState(state) { sendToRenderer('refresh-state', state); }

async function bootstrap() {
  app.setAppUserModelId(eveConfig.APP_USER_MODEL_ID);
  const currentSettings = settingsMod.getSettings();
  app.setLoginItemSettings({ openAtLogin: Boolean(currentSettings.openAtLogin) });

  debugEngine.initEngine();
  logger.info('MAIN', 'Bootstrap starting');

  accounts.loadAccounts();
  eve.loadImplantSlotCache();

  accounts.init({
    onBroadcast: onAccountsBroadcast,
    onSkillCompleted, onQueueWarning, onQueueEmpty, onWalletActivity, onRefreshState
  });

  windowTray.setActions({ refreshAll: accounts.refreshAll, addAccount: accounts.addAccount });

  ipc.registerIpcHandlers();
  windowTray.createWindow();

  // Initialize the auto-updater with the main window
  const mainWindow = windowTray.getWindow();
  if (mainWindow) {
    updater.initUpdater(mainWindow);
  }

  if (currentSettings.startMinimized) {
    const win = windowTray.getWindow();
    if (win && !win.isDestroyed()) win.hide();
  }

  windowTray.createTray();
  if (process.platform === 'win32') {
    toastWindow.createToastWindow();
  }

  // Start the new V2 scheduler for ESI pullers
  scheduler.start();
  esiStatus.start();

  logger.info('MAIN', 'Bootstrap complete');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => { windowTray.showWindow(); });
  app.whenReady().then(() => {
    bootstrap().catch(console.error);
  });
}

app.on('before-quit', () => {
  windowTray.setQuitting(true);
  scheduler.stop();
  esiStatus.stop();
  require('./main/snapshots').shutdown();
});
app.on('window-all-closed', () => { /* Keep running in tray. */ });
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
  notifications.notifySkillCompleted(payload);
  sendToRenderer('notification:skill-complete', payload || {});
}

function onQueueWarning(payload) {
  notifications.notifyQueueWarning(payload);
  sendToRenderer('notification:queue-warning', payload || {});
}

function onQueueEmpty(payload) { sendToRenderer('notification:queue-empty', payload || {}); }
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
    onSkillCompleted, onQueueWarning, onQueueEmpty, onRefreshState
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
});
app.on('window-all-closed', () => { /* Keep running in tray. */ });
'use strict';

const { app } = require('electron');

// Software rendering fixes transparent-window repaint issues on Windows.
app.disableHardwareAcceleration();

// Allow notification chimes to play without a user gesture.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const assetsQueue = require('./main/assets-queue');
const eveConfig = require('./eve/config');
const eve = require('./eve');
const windowTray = require('./main/window-tray');
const accounts = require('./main/accounts');
const walletMonitor = require('./main/wallet-monitor');
const ipc = require('./main/ipc');
const legacyGuard = require('./main/legacy-guard');
const toastWindow = require('./main/toast-window');
const notifications = require('./main/notifications');
const settingsMod = require('./main/settings');

let testHarness = null;

function sendToRenderer(channel, payload) {
  const win = windowTray.getWindow();

  if (win && !win.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function onAccountsBroadcast(publicAccounts) {
  sendToRenderer('accounts-updated', publicAccounts);
  windowTray.setTooltipAccounts(accounts.getAccounts());
}

function onSkillCompleted(payload) {
  notifications.notifySkillCompleted(payload);
}

function onQueueWarning(payload) {
  notifications.notifyQueueWarning(payload);
}

function onRefreshState(state) {
  sendToRenderer('refresh-state', state);
}

function onWalletActivity(payload) {
  notifications.notifyWalletActivity(payload);
}

function onAccountRemoved(characterId) {
  walletMonitor.removeBaseline(characterId);
}

async function bootstrap() {
  app.setAppUserModelId(eveConfig.APP_USER_MODEL_ID);

  const currentSettings = settingsMod.getSettings();

  app.setLoginItemSettings({
    openAtLogin: Boolean(currentSettings.openAtLogin)
  });

  accounts.loadAccounts();

  eve.loadImplantSlotCache();

  accounts.init({
    onBroadcast: onAccountsBroadcast,
    onSkillCompleted,
    onQueueWarning,
    onRefreshState,
    onAccountRemoved
  });

  walletMonitor.init({
    onWalletActivity
  });

  windowTray.setActions({
    refreshAll: accounts.refreshAll,
    addAccount: accounts.addAccount
  });

  try {
    testHarness = require('./test/test-main.js');
    testHarness.init({
      getWindow: windowTray.getWindow,
      getAccounts: accounts.getAccounts,
      refreshAll: accounts.refreshAll,
      showWindow: windowTray.showWindow
    });
    ipc.setTestHarness(testHarness);
  } catch (err) {
    console.error('Test harness failed to load:', err);
    testHarness = null;
  }

  ipc.registerIpcHandlers();

  assetsQueue.start();

  windowTray.createWindow();

  if (currentSettings.startMinimized) {
    const win = windowTray.getWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  }

  windowTray.createTray();
  toastWindow.createToastWindow();

  await accounts.refreshAll();

  setInterval(() => {
    accounts.refreshAll().catch(console.error);
  }, eveConfig.REFRESH.intervalMs);

  walletMonitor.start(eveConfig.WALLET_MONITOR.intervalMs);
}

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowTray.showWindow();
  });

  app.whenReady().then(() => {
    if (!legacyGuard.ensureLegacyAppClosed()) {
      app.quit();
      return;
    }

    bootstrap().catch(console.error);
  });
}

app.on('before-quit', () => {
  windowTray.setQuitting(true);
  walletMonitor.stop();
});

app.on('window-all-closed', () => {
  // Keep running in tray.
});
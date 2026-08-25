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
const skillsSync = require('./main/skills-sync');
const walletSync = require('./main/wallet-sync');
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
  sendToRenderer('notification:skill-complete', payload || {});
}

function onQueueWarning(payload) {
  notifications.notifyQueueWarning(payload);
  sendToRenderer('notification:queue-warning', payload || {});
}

function onQueueEmpty(payload) {
  sendToRenderer('notification:queue-empty', payload || {});
}

function onRefreshState(state) {
  sendToRenderer('refresh-state', state);
}

function onWalletActivity(payload) {
  notifications.notifyWalletActivity(payload);
  sendToRenderer('notification:wallet-activity', payload || {});
}

function onAccountRemoved(characterId) {
  walletMonitor.removeBaseline(characterId);
  skillsSync.removeCharacter(characterId);
  walletSync.removeCharacter(characterId);
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
    onQueueEmpty,
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

  // Asset ESI pulls are paused for now — the 2-hourly background sweep is
  // disabled until the assets tab is rebuilt. Manual asset fetches from
  // the tab still work off the cached data.
  // assetsQueue.start();

  windowTray.createWindow();

  if (currentSettings.startMinimized) {
    const win = windowTray.getWindow();
    if (win && !win.isDestroyed()) {
      win.hide();
    }
  }

  windowTray.createTray();
  toastWindow.createToastWindow();

  // Skills pull is the first sequenced ESI section; it runs on its own
  // timer from here (startup pull + every 15 minutes). The wallet pull
  // queues behind it (startup pull + every 10 minutes).
  skillsSync.start();
  walletSync.start();

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
  skillsSync.stop();
  walletSync.stop();
});

app.on('window-all-closed', () => {
  // Keep running in tray.
});
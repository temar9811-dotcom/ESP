'use strict';

const { app } = require('electron');

const eveConfig = require('./eve/config');
const windowTray = require('./main/window-tray');
const accounts = require('./main/accounts');
const walletMonitor = require('./main/wallet-monitor');
const ipc = require('./main/ipc');
const legacyGuard = require('./main/legacy-guard');

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
  sendToRenderer('notification:skill-complete', payload);
}

function onWalletActivity(payload) {
  sendToRenderer('notification:wallet-activity', payload);
}

function onAccountRemoved(characterId) {
  walletMonitor.removeBaseline(characterId);
}

async function bootstrap() {
  app.setAppUserModelId(eveConfig.APP_USER_MODEL_ID);

  accounts.loadAccounts();

  accounts.init({
    onBroadcast: onAccountsBroadcast,
    onSkillCompleted,
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

  windowTray.createWindow();
  windowTray.createTray();

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
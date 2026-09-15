// main.js
// VERSION: 1.3
'use strict';
const { app } = require('electron');
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

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
const logger = require('./main/debug/logger');
const debugEngine = require('./main/debug/engine');
const scheduler = require('./main/scheduler');

let testHarness = null;

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

function onWalletActivity(payload) {
  notifications.notifyWalletActivity(payload);
  sendToRenderer('notification:wallet-activity', payload || {});
}

function onAccountRemoved(characterId) {
  walletMonitor.removeBaseline(characterId);
}

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
    onSkillCompleted, onQueueWarning, onQueueEmpty, onRefreshState, onAccountRemoved
  });

  walletMonitor.init({ onWalletActivity });
  windowTray.setActions({ refreshAll: accounts.refreshAll, addAccount: accounts.addAccount });

  try {
    testHarness = require('./test/test-main.js');
    testHarness.init({ getWindow: windowTray.getWindow, getAccounts: accounts.getAccounts, refreshAll: accounts.refreshAll, showWindow: windowTray.showWindow });
    ipc.setTestHarness(testHarness);
  } catch (err) {
    logger.error('MAIN', 'Test harness failed to load', { error: err.message });
    testHarness = null;
  }

  ipc.registerIpcHandlers();
  windowTray.createWindow();

  if (currentSettings.startMinimized) {
    const win = windowTray.getWindow();
    if (win && !win.isDestroyed()) win.hide();
  }

  windowTray.createTray();
  toastWindow.createToastWindow();

  // Start the new V2 scheduler for ESI pullers
  scheduler.start();

  // Legacy syncs commented out while we rewrite the backend
  // skillsSync.start(); walletSync.start(); assetsSync.start(); assetsNames.start();
  // setInterval(() => { accounts.refreshAll().catch(console.error); }, eveConfig.REFRESH.intervalMs);

  walletMonitor.start(eveConfig.WALLET_MONITOR.intervalMs);
  logger.info('MAIN', 'Bootstrap complete');
}

const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => { windowTray.showWindow(); });
  app.whenReady().then(() => {
    if (!legacyGuard.ensureLegacyAppClosed()) { app.quit(); return; }
    bootstrap().catch(console.error);
  });
}

app.on('before-quit', () => {
  windowTray.setQuitting(true);
  scheduler.stop();
  walletMonitor.stop();
});

app.on('window-all-closed', () => { /* Keep running in tray. */ });
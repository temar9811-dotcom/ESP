// main/updater.js
// VERSION: 1.3
// The updater always runs: it checks the release feed hourly regardless of the
// "auto install" setting. That setting only decides what happens when an update
// is found — with it on, the update dialog drives the download and installs on
// quit; with it off, nothing fires on its own and the top bar shows an
// "Update Now" button the user clicks to download and install immediately.
'use strict';
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const logger = require('./debug/logger');
const settings = require('./settings');

const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let mainWindow = null;
let pendingNotes = '';
let checkTimer = null;
let checking = false;
let availableVersion = null;

function isAutoInstallEnabled() {
  const s = settings.getSettings() || {};
  return s.autoInstallUpdates !== false;
}

function sendState(state, extra = {}) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('updater:status', {
        state,
        autoInstall: isAutoInstallEnabled(),
        available: Boolean(availableVersion),
        version: availableVersion,
        ...extra
      });
    }
  } catch {
    // Window gone; nothing to report to.
  }
}

// Hourly release-feed check. Always active; the auto-install setting does not
// gate it. Unpackaged builds have no feed, so they are skipped.
function runCheck(reason) {
  if (checking) {
    logger.info('UPDATER', 'Check already in progress, skipping', { reason });
    return false;
  }
  if (!app.isPackaged) {
    logger.info('UPDATER', 'Not packaged, skipping update check', { reason });
    return false;
  }
  checking = true;
  logger.info('UPDATER', 'Checking for updates', { reason });
  try {
    Promise.resolve(autoUpdater.checkForUpdates())
      .catch((e) => logger.error('UPDATER', 'checkForUpdates failed', { error: e.message }))
      .finally(() => { checking = false; });
  } catch (e) {
    checking = false;
    logger.error('UPDATER', 'checkForUpdates threw', { error: e.message });
  }
  return true;
}

// "Update Now" — the user explicitly firing the updater. The install follows
// automatically once the download lands (see the update-downloaded handler), so
// this only has to start the download.
function fireUpdater() {
  if (!app.isPackaged) {
    sendState('unavailable');
    return { started: false };
  }
  if (!availableVersion) {
    runCheck('fire');
    return { started: false, noUpdate: true };
  }
  sendState('downloading', { version: availableVersion });
  try {
    autoUpdater.downloadUpdate();
  } catch (e) {
    logger.error('UPDATER', 'downloadUpdate threw', { error: e.message });
    sendState('error', { message: e.message });
    return { started: false };
  }
  logger.info('UPDATER', 'Fired updater on user request', { version: availableVersion });
  return { started: true, version: availableVersion };
}

function stopAutoCheck() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

function startAutoCheck() {
  stopAutoCheck();
  if (!app.isPackaged) return;
  runCheck('startup');
  checkTimer = setInterval(() => runCheck('hourly'), CHECK_INTERVAL_MS);
  logger.info('UPDATER', 'Update checks scheduled', { intervalMs: CHECK_INTERVAL_MS });
}

// The setting controls who initiates the update, not the polling. Installing
// always happens right after a download completes, so nothing is left to do on
// quit — this only re-notifies the renderer (and raises the dialog if the user
// has just switched automatic installs back on while an update is waiting).
function applyAutoInstallSetting() {
  const enabled = isAutoInstallEnabled();
  logger.info('UPDATER', 'Auto install setting applied', { autoInstall: enabled });
  if (enabled && availableVersion && mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:available', { version: availableVersion });
  }
  sendState('setting', { autoInstall: enabled });
}

function getStatus() {
  return {
    autoInstall: isAutoInstallEnabled(),
    available: Boolean(availableVersion),
    version: availableVersion,
    intervalMs: CHECK_INTERVAL_MS,
    supported: app.isPackaged
  };
}

function initUpdater(win) {
  mainWindow = win;
  autoUpdater.autoDownload = false;
  // Kept as before: the update-downloaded handler quits and installs right away,
  // and this remains as a fallback if the app is quit some other way.
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logger.info('UPDATER', 'Update available', { version: info.version });
    pendingNotes = info.releaseNotes || 'No release notes available.';
    availableVersion = info.version;
    // With auto install off, the top-bar "Update Now" button drives it instead
    // of the dialog.
    if (isAutoInstallEnabled()) {
      mainWindow.webContents.send('updater:available', { version: info.version });
    }
    sendState('available', { version: info.version });
  });

  autoUpdater.on('update-not-available', () => {
    logger.info('UPDATER', 'Already up to date');
    availableVersion = null;
    sendState('current');
  });

  autoUpdater.on('update-downloaded', () => {
    // Always install the moment the download completes, on both paths.
    logger.info('UPDATER', 'Update downloaded. Installing...');
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (err) => {
    logger.error('UPDATER', 'Update error', { error: err.message });
    sendState('error', { message: err.message });
  });

  app.on('will-quit', stopAutoCheck);

  startAutoCheck();
}

function readChangelog() {
  const candidates = [
    path.join(app.getAppPath(), 'CHANGELOG.md'),
    path.join(__dirname, '..', 'CHANGELOG.md')
  ];
  for (const file of candidates) {
    try {
      const text = fs.readFileSync(file, 'utf8');
      if (text && text.trim()) return text.trim();
    } catch {
      // Try the next path.
    }
  }
  return null;
}

function getChangelog() {
  const currentVersion = app.getVersion();
  const appSettings = settings.getSettings();
  if (appSettings.lastSeenVersion !== currentVersion) {
    settings.setSettings({ ...appSettings, lastSeenVersion: currentVersion });
    return {
      show: true,
      version: currentVersion,
      notes: readChangelog() || pendingNotes || 'Welcome to the new version!'
    };
  }
  return { show: false };
}

function registerUpdaterIpc() {
  ipcMain.handle('updater:download', () => { autoUpdater.downloadUpdate(); return { ok: true }; });
  ipcMain.handle('updater:dismiss', () => { logger.info('UPDATER', 'Dismissed'); return { ok: true }; });
  ipcMain.handle('updater:close-changelog', () => { return { ok: true }; });
  ipcMain.handle('updater:get-changelog', () => getChangelog());
  ipcMain.handle('updater:status', () => getStatus());
  ipcMain.handle('updater:fireNow', () => fireUpdater());
}

module.exports = {
  initUpdater,
  registerUpdaterIpc,
  isAutoInstallEnabled,
  applyAutoInstallSetting,
  stopAutoCheck
};

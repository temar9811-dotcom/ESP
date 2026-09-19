// main/updater.js
// VERSION: 1.0
'use strict';
const { ipcMain, app } = require('electron');
const logger = require('./debug/logger');
const settings = require('./settings');
const { execSync } = require('child_process');

let mainWindow = null;
let pendingNotes = '';
let autoUpdater = null;

try {
  const { autoUpdater: updater } = require('electron-updater');
  autoUpdater = updater;
} catch {
  logger.info('UPDATER', 'electron-updater not available');
}

function isAppSigned() {
  if (process.platform !== 'darwin') return true;
  try {
    execSync(`codesign -dv "${app.getAppPath()}"`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function initUpdater(win, skipUpdates = false) {
  mainWindow = win;
  if (!autoUpdater || skipUpdates || !isAppSigned()) {
    logger.info('UPDATER', 'Update checks disabled for unsigned build');
    checkChangelog();
    return;
  }
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    logger.info('UPDATER', 'Update available', { version: info.version });
    pendingNotes = info.releaseNotes || 'No release notes available.';
    mainWindow.webContents.send('updater:available', { version: info.version });
  });

  autoUpdater.on('update-downloaded', () => {
    logger.info('UPDATER', 'Update downloaded. Installing...');
    autoUpdater.quitAndInstall(false, true);
  });

  autoUpdater.on('error', (err) => logger.error('UPDATER', 'Update error', { error: err.message }));

  autoUpdater.checkForUpdates();
  checkChangelog();
}

function checkChangelog() {
  const currentVersion = app.getVersion();
  const appSettings = settings.getSettings();
  if (appSettings.lastSeenVersion !== currentVersion) {
    mainWindow.webContents.send('updater:show-changelog', {
      version: currentVersion,
      notes: pendingNotes || 'Welcome to the new version!'
    });
    settings.setSettings({ ...appSettings, lastSeenVersion: currentVersion });
  }
}

function registerUpdaterIpc() {
  if (!isAppSigned() || !autoUpdater) return;
  ipcMain.handle('updater:download', () => { autoUpdater.downloadUpdate(); return { ok: true }; });
  ipcMain.handle('updater:dismiss', () => { logger.info('UPDATER', 'Dismissed'); return { ok: true }; });
  ipcMain.handle('updater:close-changelog', () => { return { ok: true }; });
}

module.exports = { initUpdater, registerUpdaterIpc };
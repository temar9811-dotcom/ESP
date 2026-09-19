// main/updater.js
// VERSION: 1.1
'use strict';
const fs = require('fs');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const logger = require('./debug/logger');
const settings = require('./settings');

let mainWindow = null;
let pendingNotes = '';

function initUpdater(win) {
  mainWindow = win;
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

function checkChangelog() {
  const currentVersion = app.getVersion();
  const appSettings = settings.getSettings();
  if (appSettings.lastSeenVersion !== currentVersion) {
    mainWindow.webContents.send('updater:show-changelog', {
      version: currentVersion,
      notes: readChangelog() || pendingNotes || 'Welcome to the new version!'
    });
    settings.setSettings({ ...appSettings, lastSeenVersion: currentVersion });
  }
}

function registerUpdaterIpc() {
  ipcMain.handle('updater:download', () => { autoUpdater.downloadUpdate(); return { ok: true }; });
  ipcMain.handle('updater:dismiss', () => { logger.info('UPDATER', 'Dismissed'); return { ok: true }; });
  ipcMain.handle('updater:close-changelog', () => { return { ok: true }; });
}

module.exports = { initUpdater, registerUpdaterIpc };
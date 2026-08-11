'use strict';

const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage
} = require('electron');
const path = require('path');
const fs = require('fs');

const { VERSION } = require('../version');
const eveConfig = require('../eve/config');

const TRAY_ICON_DATA =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

let win = null;
let tray = null;
let isQuitting = false;
let tooltipAccounts = [];

let actions = {
  refreshAll: async () => {},
  addAccount: async () => {}
};

function setActions(newActions) {
  actions = {
    ...actions,
    ...(newActions || {})
  };
}

function setQuitting(value) {
  isQuitting = Boolean(value);
}

function getWindow() {
  return win;
}

function getTrayIcon() {
  const assetPath = path.join(__dirname, '..', 'assets', 'tray.png');

  try {
    if (fs.existsSync(assetPath)) {
      return nativeImage.createFromPath(assetPath).resize({
        width: 16,
        height: 16
      });
    }
  } catch {
    // Fall back to embedded icon.
  }

  return nativeImage.createFromDataURL(TRAY_ICON_DATA).resize({
    width: 16,
    height: 16
  });
}

function showWindow() {
  if (!win) {
    createWindow();
    return;
  }

  if (win.isMinimized()) {
    win.restore();
  }

  win.show();
}

function remainingUntil(dateStr) {
  if (!dateStr) return '';

  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return '';

  const ms = target - Date.now();
  if (ms <= 0) return 'complete';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function updateTrayTooltip() {
  if (!tray) return;

  const header = `${eveConfig.APP_NAME} v${VERSION}`;

  if (!tooltipAccounts.length) {
    tray.setToolTip(`${header}\nNo characters added`);
    return;
  }

  const lines = tooltipAccounts.slice(0, 3).map((account) => {
    if (!account.activeSkill) {
      return `${account.characterName || 'Character'}: idle`;
    }

    const remaining = remainingUntil(account.activeSkill.finish_date);

    return `${account.characterName || 'Character'}: ${
      account.activeSkill.skillName || 'Unknown'
    } L${account.activeSkill.finished_level || '?'} (${remaining})`;
  });

  tray.setToolTip([header, ...lines].join('\n'));
}

function setTooltipAccounts(accounts) {
  tooltipAccounts = Array.isArray(accounts) ? accounts : [];
  updateTrayTooltip();
}

function createWindow() {
  win = new BrowserWindow({
    width: 1150,
    height: 760,
    show: false,
    title: `${eveConfig.APP_NAME} v${VERSION}`,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
    }
  });

  win.on('closed', () => {
    win = null;
  });
}

function createTray() {
  if (tray) return;

  tray = new Tray(getTrayIcon());
  tray.setToolTip(`${eveConfig.APP_NAME} v${VERSION}\nNo characters added`);

  const menu = Menu.buildFromTemplate([
    {
      label: 'Open',
      click: () => showWindow()
    },
    {
      label: 'Refresh now',
      click: () => {
        actions.refreshAll().catch(console.error);
      }
    },
    {
      label: 'Add character',
      click: () => {
        actions
          .addAccount()
          .then(() => showWindow())
          .catch((err) => {
            console.error(err);
            showWindow();
          });
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true;
        app.quit();
      }
    }
  ]);

  tray.setContextMenu(menu);

  tray.on('double-click', () => {
    showWindow();
  });
}

module.exports = {
  setActions,
  setQuitting,
  getWindow,
  showWindow,
  createWindow,
  createTray,
  setTooltipAccounts
};
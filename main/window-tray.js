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
let saveBoundsTimer = null;

let actions = {
  refreshAll: async () => {},
  addAccount: async () => {}
};

// The layout (character rail + skill groups sized to their text) needs
// at least this much room; the window cannot be resized smaller.
const MIN_WIDTH = 1240;
const MIN_HEIGHT = 700;

function boundsFile() {
  return path.join(app.getPath('userData'), 'window-bounds.json');
}

function loadBounds() {
  try {
    const raw = fs.readFileSync(boundsFile(), 'utf8');
    const b = JSON.parse(raw);
    if (
      typeof b.x === 'number' &&
      typeof b.y === 'number' &&
      typeof b.width === 'number' &&
      typeof b.height === 'number' &&
      b.width >= MIN_WIDTH &&
      b.height >= MIN_HEIGHT
    ) {
      return b;
    }
  } catch {
    // No saved bounds yet.
  }

  return null;
}

function saveBounds() {
  if (!win || win.isDestroyed()) return;

  const bounds = win.getBounds();
  const display = require('electron').screen.getDisplayMatching(bounds);
  const workArea = display.workArea;
  const clamped = {
    x: Math.max(workArea.x, Math.min(bounds.x, workArea.x + workArea.width - 100)),
    y: Math.max(workArea.y, Math.min(bounds.y, workArea.y + workArea.height - 100)),
    width: Math.max(MIN_WIDTH, Math.min(bounds.width, workArea.width)),
    height: Math.max(MIN_HEIGHT, Math.min(bounds.height, workArea.height))
  };

  try {
    fs.mkdirSync(path.dirname(boundsFile()), { recursive: true });
    fs.writeFileSync(boundsFile(), JSON.stringify(clamped), 'utf8');
  } catch {
    // Ignore write errors.
  }
}

function debounceSaveBounds() {
  if (saveBoundsTimer) clearTimeout(saveBoundsTimer);
  saveBoundsTimer = setTimeout(() => {
    saveBoundsTimer = null;
    saveBounds();
  }, 500);
}

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

function getAppIconPath() {
  const iconPath = path.join(__dirname, '..', 'assets', 'icon.png');

  try {
    if (fs.existsSync(iconPath)) {
      return iconPath;
    }
  } catch {
    // Ignore lookup errors.
  }

  return undefined;
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
  const saved = loadBounds();

  const windowOpts = {
    width: MIN_WIDTH,
    height: 900,
    minWidth: MIN_WIDTH,
    minHeight: MIN_HEIGHT,
    show: false,
    title: `${eveConfig.APP_NAME} v${VERSION}`,
    autoHideMenuBar: true,
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  };

  if (saved) {
    windowOpts.x = saved.x;
    windowOpts.y = saved.y;
    windowOpts.width = saved.width;
    windowOpts.height = saved.height;
  }

  win = new BrowserWindow(windowOpts);

  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.once('ready-to-show', () => {
    win.show();
  });

  win.on('resize', debounceSaveBounds);
  win.on('move', debounceSaveBounds);

  win.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      win.hide();
      return;
    }

    saveBounds();
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
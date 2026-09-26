'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const logger = require('./debug/logger');
const settings = require('./settings');

const CUSTOM_SOUND_KEYS = {
  skill: 'customSoundSkill',
  wallet: 'customSoundWallet',
  queue: 'customSoundQueue'
};

const TOAST_WIDTH = 380;
const TOAST_HEIGHT = 340;

// Per-toast bubble height (bubble + gap + padding margin) used to size the
// transparent window when toastMaxVisible is lowered.
const BUBBLE_SLOT = 76;
const BUBBLE_GAP_PAD = 16;

let toastWin = null;
let moveMode = false;
let lastAppliedStackTop = null;

function clamp(n, min, max) {
  n = Number(n) || 0;
  return Math.min(max, Math.max(min, n));
}

const soundCache = new Map();

// Returns a base64 data URL for the configured custom WAV of the given
// notification kind ('skill' | 'wallet' | 'queue'), or null when the user
// hasn't picked one (synthesized chime) or the file can't be read.
function resolveCustomSound(kind) {
  const key = CUSTOM_SOUND_KEYS[kind];
  if (!key) return null;
  const filePath = settings.getSettings()[key];
  if (!filePath) return null;
  if (soundCache.has(filePath)) return soundCache.get(filePath);
  try {
    const b64 = fs.readFileSync(filePath).toString('base64');
    const dataUrl = `data:audio/wav;base64,${b64}`;
    soundCache.set(filePath, dataUrl);
    logger.debug('TOAST-WIN', 'Loaded custom sound', { kind, filePath });
    return dataUrl;
  } catch (err) {
    logger.error('TOAST-WIN', 'Failed to load custom sound', { kind, filePath, error: err.message });
    return null;
  }
}

function getSavedPosition() {
  const cfg = settings.getSettings();
  const x = Number(cfg?.toastX);
  const y = Number(cfg?.toastY);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return { x, y };
}

// If the saved position intersects any display work area, return it; otherwise
// null so the caller can fall back to the default bottom-right corner (e.g.
// the monitor it was saved on has been unplugged).
function resolveStartPosition(width, height) {
  const saved = getSavedPosition();
  if (saved) {
    const displays = screen.getAllDisplays();
    const hit = displays.some((d) => {
      const wa = d.workArea;
      return (
        saved.x < wa.x + wa.width - 40 &&
        saved.x + width > wa.x + 40 &&
        saved.y < wa.y + wa.height - 40 &&
        saved.y + height > wa.y + 40
      );
    });
    if (hit) return saved;
  }
  const workArea = screen.getPrimaryDisplay().workArea;
  const topDown = Boolean(settings.getSettings().toastStackTop);
  if (topDown) {
    return {
      x: workArea.x + workArea.width - width - 16,
      y: workArea.y + 16
    };
  }
  return {
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height - 16
  };
}

function resolveHeight() {
  const maxVisible = clamp(settings.getSettings().toastMaxVisible, 1, 10);
  const workArea = screen.getPrimaryDisplay().workArea;
  const scaled = maxVisible * BUBBLE_SLOT + BUBBLE_GAP_PAD;
  return Math.min(scaled, Math.max(TOAST_HEIGHT, workArea.height - 32)) || TOAST_HEIGHT;
}

function positionWindow(win) {
  const [width, height] = win.getSize();
  const pos = resolveStartPosition(width, height);
  win.setPosition(Math.round(pos.x), Math.round(pos.y));
}

function createToastWindow() {
  if (toastWin) return toastWin;

  const workArea = screen.getPrimaryDisplay().workArea;
  const height = resolveHeight();
  const width = TOAST_WIDTH;

  toastWin = new BrowserWindow({
    width,
    height,
    x: workArea.x + workArea.width - width - 16,
    y: workArea.y + workArea.height - height - 16,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    focusable: false,
    skipTaskbar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'toast-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false
    }
  });

  toastWin.setIgnoreMouseEvents(true);

  toastWin.loadFile(path.join(__dirname, '..', 'renderer', 'toast.html'));

  toastWin.webContents.once('did-finish-load', () => {
    if (toastWin && !toastWin.isDestroyed()) {
      positionWindow(toastWin);
      toastWin.show();

      // Force Windows DWM to composite the transparent window.
      const bounds = toastWin.getBounds();
      toastWin.setBounds({ ...bounds, height: bounds.height + 1 });

      setTimeout(() => {
        if (toastWin && !toastWin.isDestroyed()) {
          toastWin.setBounds(bounds);
        }
      }, 50);

      toastWin.webContents.send('toast:config', {
        maxVisible: clamp(settings.getSettings().toastMaxVisible, 1, 10),
        durationMs: clamp(settings.getSettings().toastDurationMs, 2000, 30000),
        stackTop: Boolean(settings.getSettings().toastStackTop)
      });

      logger.info('TOAST-WIN', 'ESP toast overlay ready');
    }
  });

  toastWin.on('closed', () => {
    toastWin = null;
    moveMode = false;
  });

  return toastWin;
}

function showToast(title, body, sound) {
  const win = createToastWindow();

  const config = settings.getSettings();
  const stackTop = Boolean(config?.toastStackTop);
  const payload = {
    title: String(title || ''),
    body: String(body || ''),
    sound: sound || null,
    soundData: sound ? resolveCustomSound(sound) : null,
    maxVisible: clamp(config?.toastMaxVisible, 1, 10),
    durationMs: clamp(config?.toastDurationMs ?? 8000, 2000, 30000),
    stackTop
  };

  const deliver = () => {
    if (toastWin && !toastWin.isDestroyed()) {
      const [width] = toastWin.getSize();
      const height = resolveHeight();
      if (height !== toastWin.getSize()[1]) {
        toastWin.setBounds({ x: toastWin.getBounds().x, y: toastWin.getBounds().y, width, height });
      }
      if (lastAppliedStackTop !== stackTop && !getSavedPosition()) {
        const pos = resolveStartPosition(width, height);
        toastWin.setPosition(Math.round(pos.x), Math.round(pos.y));
      }
      lastAppliedStackTop = stackTop;
      logger.debug('TOAST-WIN', 'Delivered toast', payload);
      toastWin.webContents.send('toast:show', payload);

      try {
        toastWin.webContents.invalidate();
      } catch {
        // Ignore invalidate errors on older Electron.
      }
    }
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver);
  } else {
    deliver();
  }
}

function startMove() {
  if (process.platform !== 'win32') return { ok: false, error: 'Toast window is Windows-only' };
  const win = createToastWindow();
  if (!win || win.isDestroyed()) return { ok: false, error: 'Toast window unavailable' };
  moveMode = true;
  win.setIgnoreMouseEvents(false);
  win.setFocusable(true);
  win.show();
  win.webContents.send('toast:move-mode', true);
  logger.info('TOAST-WIN', 'Toast move mode started');
  return { ok: true };
}

function clampToWorkArea(bounds) {
  const displays = screen.getAllDisplays();
  const area = displays.find((d) => {
    const wa = d.workArea;
    return (
      bounds.x >= wa.x - 20 &&
      bounds.x + bounds.width <= wa.x + wa.width + 20 &&
      bounds.y >= wa.y - 20 &&
      bounds.y + bounds.height <= wa.y + wa.height + 20
    );
  })?.workArea || screen.getPrimaryDisplay().workArea;

  return {
    x: clamp(bounds.x, area.x, area.x + area.width - bounds.width),
    y: clamp(bounds.y, area.y, area.y + area.height - bounds.height)
  };
}

function endMove() {
  const win = toastWin;
  if (!win || win.isDestroyed()) {
    moveMode = false;
    return { ok: false, error: 'Toast window unavailable' };
  }
  const [width, height] = win.getSize();
  const clamped = clampToWorkArea(win.getBounds());
  win.setPosition(clamped.x, clamped.y);
  win.setIgnoreMouseEvents(true);
  win.setFocusable(false);
  win.webContents.send('toast:move-mode', false);
  win.webContents.send('toast:config', {
    maxVisible: clamp(settings.getSettings().toastMaxVisible, 1, 10),
    durationMs: clamp(settings.getSettings().toastDurationMs, 2000, 30000),
    stackTop: Boolean(settings.getSettings().toastStackTop)
  });
  settings.setSettings({ toastX: clamped.x, toastY: clamped.y });
  moveMode = false;
  logger.info('TOAST-WIN', `Toast position saved: ${clamped.x}, ${clamped.y}`);
  return { ok: true, x: clamped.x, y: clamped.y, width, height };
}

module.exports = {
  createToastWindow,
  showToast,
  startMove,
  endMove
};
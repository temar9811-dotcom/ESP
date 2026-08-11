'use strict';

const { BrowserWindow, screen } = require('electron');
const path = require('path');

const TOAST_WIDTH = 380;
const TOAST_HEIGHT = 340;

let toastWin = null;

function createToastWindow() {
  if (toastWin) return toastWin;

  const workArea = screen.getPrimaryDisplay().workArea;

  toastWin = new BrowserWindow({
    width: TOAST_WIDTH,
    height: TOAST_HEIGHT,
    x: workArea.x + workArea.width - TOAST_WIDTH - 16,
    y: workArea.y + workArea.height - TOAST_HEIGHT - 16,
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
      sandbox: false
    }
  });

  toastWin.setIgnoreMouseEvents(true);

  toastWin.loadFile(path.join(__dirname, '..', 'renderer', 'toast.html'));

  toastWin.webContents.once('did-finish-load', () => {
    if (toastWin && !toastWin.isDestroyed()) {
      toastWin.show();
      console.log('ESP toast overlay ready.');
    }
  });

  toastWin.on('closed', () => {
    toastWin = null;
  });

  return toastWin;
}

function showToast(title, body) {
  const win = createToastWindow();

  const payload = {
    title: String(title || ''),
    body: String(body || '')
  };

  const deliver = () => {
    if (toastWin && !toastWin.isDestroyed()) {
      console.log('ESP toast delivered:', payload.title);
      toastWin.webContents.send('toast:show', payload);
    }
  };

  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', deliver);
  } else {
    deliver();
  }
}

module.exports = {
  createToastWindow,
  showToast
};
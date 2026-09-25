'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastApi', {
  onToast: (callback) => {
    ipcRenderer.on('toast:show', (_event, payload) => {
      callback(payload);
    });
  },
  onMoveMode: (callback) => {
    ipcRenderer.on('toast:move-mode', (_event, active) => {
      callback(Boolean(active));
    });
  },
  onConfig: (callback) => {
    ipcRenderer.on('toast:config', (_event, config) => {
      callback(config);
    });
  }
});
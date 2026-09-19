'use strict';

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('toastApi', {
  onToast: (callback) => {
    ipcRenderer.on('toast:show', (_event, payload) => {
      callback(payload);
    });
  }
});
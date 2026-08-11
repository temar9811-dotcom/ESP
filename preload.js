'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The preload script creates the secure bridge between the main process
// and the renderer process. Only methods exposed here are available in the UI.
contextBridge.exposeInMainWorld('eveApi', {
  // --- App & System ---
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // --- Accounts & Characters ---
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: () => ipcRenderer.invoke('accounts:add'),
  removeAccount: (characterId) => ipcRenderer.invoke('accounts:remove', characterId),
  refreshAll: () => ipcRenderer.invoke('accounts:refresh'),

  // --- Wallet ---
  getWalletDetails: (characterId) => ipcRenderer.invoke('accounts:getWalletDetails', characterId),

  // --- Skill Plans ---
  readClipboardPlan: () => ipcRenderer.invoke('plans:readClipboard'),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  savePlan: (plan) => ipcRenderer.invoke('plans:save', plan),
  deletePlan: (planId) => ipcRenderer.invoke('plans:delete', planId),

  // --- Test Harness ---
  testEnabled: () => ipcRenderer.invoke('test:enabled'),
  testRun: (command, payload) => ipcRenderer.invoke('test:run', command, payload),

  // --- Event Subscriptions ---
  // These return an unsubscribe function for cleanup.
  onAccountsUpdated: (callback) => {
    const listener = (_event, accounts) => callback(accounts);
    ipcRenderer.on('accounts-updated', listener);
    return () => {
      ipcRenderer.removeListener('accounts-updated', listener);
    };
  },

  onSkillCompleted: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification:skill-complete', listener);
    return () => {
      ipcRenderer.removeListener('notification:skill-complete', listener);
    };
  },

  onWalletActivity: (callback) => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('notification:wallet-activity', listener);
    return () => {
      ipcRenderer.removeListener('notification:wallet-activity', listener);
    };
  }
});
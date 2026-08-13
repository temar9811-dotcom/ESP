'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// The preload script creates the secure bridge between the main process
// and the renderer process. Only methods exposed here are available in the UI.
contextBridge.exposeInMainWorld('eveApi', {
  // --- App & System ---
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // --- Accounts & Characters ---
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (scopeChoice) => ipcRenderer.invoke('accounts:add', scopeChoice),
  cancelLogin: () => ipcRenderer.invoke('accounts:cancelLogin'),
  removeAccount: (characterId) => ipcRenderer.invoke('accounts:remove', characterId),
  refreshAll: () => ipcRenderer.invoke('accounts:refresh'),
  getCorpInfo: (characterId) => ipcRenderer.invoke('accounts:getCorpInfo', characterId),

  // --- Account Groups ---
  getGroups: () => ipcRenderer.invoke('groups:get'),
  setGroup: (characterId, name) => ipcRenderer.invoke('groups:set', characterId, name),
  setGroupPrimary: (characterId) => ipcRenderer.invoke('groups:setPrimary', characterId),
  toggleGroup: (groupName) => ipcRenderer.invoke('groups:toggle', groupName),

  // --- Skills ---
  getSkillMeta: (ids) => ipcRenderer.invoke('skills:getMeta', ids),

  // --- Wallet ---
  getWalletDetails: (characterId) => ipcRenderer.invoke('accounts:getWalletDetails', characterId),

  // --- Skill Plans ---
  readClipboardPlan: () => ipcRenderer.invoke('plans:readClipboard'),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  savePlan: (plan) => ipcRenderer.invoke('plans:save', plan),
  deletePlan: (planId) => ipcRenderer.invoke('plans:delete', planId),

  // --- Settings & Legacy Import ---
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  importLegacy: () => ipcRenderer.invoke('import:legacy'),

  // --- Toast Notifications ---
  showToast: (title, body) => ipcRenderer.invoke('toast:show', title, body),

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
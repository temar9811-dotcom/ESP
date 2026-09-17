// File: preload.js | Version: 1.2
'use strict';
const { contextBridge, ipcRenderer } = require('electron');

const on = (channel) => (callback) => {
  const listener = (_event, payload) => callback(payload);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('eveApi', {
  getVersion: () => ipcRenderer.invoke('app:getVersion'),
  getRefreshState: () => ipcRenderer.invoke('app:getRefreshState'),
  getSyncState: () => ipcRenderer.invoke('app:getSyncState'),
  getSequencerState: () => ipcRenderer.invoke('app:getSequencerState'),
  listAccounts: () => ipcRenderer.invoke('accounts:list'),
  addAccount: (scopeChoice) => ipcRenderer.invoke('accounts:add', scopeChoice),
  cancelLogin: () => ipcRenderer.invoke('accounts:cancelLogin'),
  removeAccount: (characterId) => ipcRenderer.invoke('accounts:remove', characterId),
  refreshAll: () => ipcRenderer.invoke('accounts:refresh'),
  getCorpInfo: (characterId) => ipcRenderer.invoke('accounts:getCorpInfo', characterId),
  getGroups: () => ipcRenderer.invoke('groups:get'),
  setGroup: (characterId, name) => ipcRenderer.invoke('groups:set', characterId, name),
  setGroupPrimary: (characterId) => ipcRenderer.invoke('groups:setPrimary', characterId),
  toggleGroup: (groupName) => ipcRenderer.invoke('groups:toggle', groupName),
  getSkillMeta: (ids) => ipcRenderer.invoke('skills:getMeta', ids),
  resolveNames: (ids) => ipcRenderer.invoke('skills:resolveNames', ids),
  getCharacterSkills: (characterId) => ipcRenderer.invoke('skills:getCharacter', characterId),
  getCharacterWallet: (characterId) => ipcRenderer.invoke('wallet:getCharacter', characterId),
  getCloneDetails: (characterId) => ipcRenderer.invoke('accounts:getCloneDetails', characterId),
  getCloneNickname: (cloneId) => ipcRenderer.invoke('cloneNicknames:get', cloneId),
  setCloneNickname: (cloneId, name) => ipcRenderer.invoke('cloneNicknames:set', cloneId, name),
  getAllCloneNicknames: () => ipcRenderer.invoke('cloneNicknames:getAll'),
  getPersonalAssets: (characterId) => ipcRenderer.invoke('assets:getPersonal', characterId),
  getCorpAssets: (characterId) => ipcRenderer.invoke('assets:getCorp', characterId),
  refreshAssetsNow: (characterId) => ipcRenderer.invoke('assets:refreshNow', characterId),
  getAssetsQueueState: () => ipcRenderer.invoke('assets:getQueueState'),
  getRawAssets: (characterId) => ipcRenderer.invoke('assets:getRaw', characterId),
  getCorpRawAssets: (characterId) => ipcRenderer.invoke('assets:getCorpRaw', characterId),
  queueAssetsRefresh: (characterId) => ipcRenderer.invoke('assets:queueRefresh', characterId),
  getAssetNames: (characterId) => ipcRenderer.invoke('assets:getNames', characterId),
  getAssetTree: (characterId) => ipcRenderer.invoke('assets-v2:getTree', characterId),
  clearCache: (which) => ipcRenderer.invoke('cache:clear', which),
  readClipboardPlan: () => ipcRenderer.invoke('plans:readClipboard'),
  listPlans: () => ipcRenderer.invoke('plans:list'),
  savePlan: (plan) => ipcRenderer.invoke('plans:save', plan),
  deletePlan: (planId) => ipcRenderer.invoke('plans:delete', planId),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (patch) => ipcRenderer.invoke('settings:set', patch),
  importLegacy: () => ipcRenderer.invoke('import:legacy'),
  showToast: (title, body) => ipcRenderer.invoke('toast:show', title, body),
  testEnabled: () => ipcRenderer.invoke('test:enabled'),
  testRun: (command, payload) => ipcRenderer.invoke('test:run', command, payload),
  getNotes: (characterId) => ipcRenderer.invoke('notes:get', characterId),
  setNotes: (characterId, text) => ipcRenderer.invoke('notes:set', characterId, text),
  debugGetLogs: () => ipcRenderer.invoke('debug:getLogs'),
  debugGetActions: () => ipcRenderer.invoke('debug:getActions'),
  debugRunAction: (name, payload) => ipcRenderer.invoke('debug:runAction', name, payload),
  debugClearLogs: () => ipcRenderer.invoke('debug:clearLogs'),
  debugLog: (payload) => ipcRenderer.invoke('debug:log', payload),
  onAccountsUpdated: on('accounts-updated'),
  onSkillCompleted: on('notification:skill-complete'),
  onWalletActivity: on('notification:wallet-activity'),
  onQueueWarning: on('notification:queue-warning'),
  onQueueEmpty: on('notification:queue-empty'),
  onRefreshState: on('refresh-state'),
  onDebugLog: on('debug:log')
});
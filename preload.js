const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('eveApi', {
getVersion: () => ipcRenderer.invoke('app:getVersion'),
listAccounts: () => ipcRenderer.invoke('accounts:list'),
addAccount: () => ipcRenderer.invoke('accounts:add'),
removeAccount: (characterId) =>
ipcRenderer.invoke('accounts:remove', characterId),
refreshAll: () => ipcRenderer.invoke('accounts:refresh'),
getWalletDetails: (characterId) =>
ipcRenderer.invoke('accounts:getWalletDetails', characterId),
readClipboardPlan: () =>
ipcRenderer.invoke('plans:readClipboard'),
listPlans: () => ipcRenderer.invoke('plans:list'),
savePlan: (plan) => ipcRenderer.invoke('plans:save', plan),
deletePlan: (planId) => ipcRenderer.invoke('plans:delete', planId),
testEnabled: () => ipcRenderer.invoke('test:enabled'),
testRun: (command, payload) =>
ipcRenderer.invoke('test:run', command, payload),
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
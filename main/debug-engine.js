// File: main/debug-engine.js | Version: 1.0
'use strict';
const logger = require('./debug-logger');

const actions = new Map();

function registerAction(name, description, handler) {
  actions.set(name, { name, description, handler });
  logger.info('ENGINE', `Registered debug action: ${name}`);
}

function getActions() {
  return Array.from(actions.values()).map(a => ({ name: a.name, description: a.description }));
}

async function runAction(name, payload) {
  const action = actions.get(name);
  if (!action) return { ok: false, error: `Unknown action: ${name}` };
  logger.info('ENGINE', `Running debug action: ${name}`, payload);
  try {
    const result = await action.handler(payload || {});
    logger.info('ENGINE', `Action ${name} completed`, { result });
    return { ok: true, result };
  } catch (err) {
    logger.error('ENGINE', `Action ${name} failed`, { error: err.message });
    return { ok: false, error: err.message };
  }
}

function registerDefaultActions() {
  const accounts = require('./accounts');
  const skillsSync = require('./skills-sync');
  const walletSync = require('./wallet-sync');
  const assetsSync = require('./assets-sync');
  
  registerAction('refreshAll', 'Refresh all characters', async () => {
    await accounts.refreshAll();
    return { accounts: accounts.getPublicAccounts().length };
  });
  
  registerAction('refreshSkills', 'Refresh skills cache', async () => {
    await skillsSync.pull();
    return { ok: true };
  });
  
  registerAction('refreshWallet', 'Refresh wallet cache', async () => {
    await walletSync.pull();
    return { ok: true };
  });
  
  registerAction('refreshAssets', 'Refresh assets cache', async () => {
    const accs = accounts.getAccounts();
    for (const acc of accs) {
      if (!acc.testPilot) await assetsSync.pull(acc.characterId);
    }
    return { ok: true };
  });
  
  registerAction('clearAllCaches', 'Clear all caches', async () => {
    if (skillsSync.resetCache) skillsSync.resetCache();
    if (walletSync.resetCache) walletSync.resetCache();
    if (assetsSync.resetCache) assetsSync.resetCache();
    return { ok: true };
  });
  
  registerAction('getAccountCount', 'Get account count', async () => {
    return { count: accounts.getAccounts().length };
  });
  
  registerAction('testLog', 'Test log levels', async () => {
    logger.debug('ENGINE', 'Test debug message');
    logger.info('ENGINE', 'Test info message');
    logger.warn('ENGINE', 'Test warn message');
    logger.error('ENGINE', 'Test error message');
    return { ok: true };
  });
}

module.exports = { registerAction, getActions, runAction, registerDefaultActions };
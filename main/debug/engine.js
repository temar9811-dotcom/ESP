// main/debug/engine.js
// VERSION: 1.3
'use strict';
const logger = require('./logger');
const scheduler = require('../scheduler');
const syncer = require('../esi/syncer');

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

function registerV2Actions() {
  registerAction('Force Char Data Pull', 'Triggers a Priority 2 pull for basic char data', async () => {
    scheduler.forcePull('char-data');
    return { ok: true, message: 'Queued with Priority 2' };
  });

  registerAction('Force Wallet Data Pull', 'Triggers a Priority 2 pull for wallet data', async () => {
    scheduler.forcePull('wallet-data');
    return { ok: true, message: 'Queued with Priority 2' };
  });

  registerAction('Force Skills Data Pull', 'Triggers a Priority 2 pull for skills data', async () => {
    scheduler.forcePull('skills-data');
    return { ok: true, message: 'Queued with Priority 2' };
  });

  registerAction('Get ESI Queue State', 'Returns current Syncer queue and active tasks', async () => {
    return syncer.getState();
  });

  registerAction('Test Log Levels', 'Generates test logs for all levels', async () => {
    logger.debug('ENGINE', 'Test debug message');
    logger.info('ENGINE', 'Test info message');
    logger.warn('ENGINE', 'Test warn message');
    logger.error('ENGINE', 'Test error message');
    return { ok: true };
  });
}

function initEngine() {
  logger.init();
  registerV2Actions();
  logger.info('ENGINE', 'Debug engine V2 initialized with core actions.');
}

module.exports = { registerAction, getActions, runAction, initEngine };
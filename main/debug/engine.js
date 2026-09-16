// main/debug/engine.js
// VERSION: 2.1
'use strict';
const logger = require('./logger');
const scheduler = require('../scheduler');
const syncer = require('../esi/syncer');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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

  registerAction('Download Static DB', 'Downloads and extracts the Fuzzwork SQLite DB', async () => {
    const staticDb = require('../esi/static-db');
    await staticDb.downloadAndExtract();
    await staticDb.initDb();
    return { ok: true, message: 'DB ready' };
  });

  registerAction('Clear Char Data Cache', 'Deletes the char-data-cache.json file', async () => {
    const cachePath = path.join(app.getPath('userData'), 'char-data-cache.json');
    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        logger.info('CACHE', 'char-data-cache.json deleted');
        return { ok: true, message: 'Cache cleared. Force pull to rebuild.' };
      }
      return { ok: true, message: 'Cache file did not exist.' };
    } catch (err) {
      logger.error('CACHE', 'Failed to delete cache', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  registerAction('Clear Skills Data Cache', 'Deletes the skills-data-cache.json file', async () => {
    const cachePath = path.join(app.getPath('userData'), 'skills-data-cache.json');
    try {
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
        logger.info('CACHE', 'skills-data-cache.json deleted');
        return { ok: true, message: 'Cache cleared. Force pull to rebuild.' };
      }
      return { ok: true, message: 'Cache file did not exist.' };
    } catch (err) {
      logger.error('CACHE', 'Failed to delete cache', { error: err.message });
      return { ok: false, error: err.message };
    }
  });

  registerAction('Test Character Systems in DB', 'Tests if character system IDs exist in the static DB', async () => {
    const staticDb = require('../esi/static-db');
    await staticDb.initDb();
    
    const testIds = [30000142, 30000765, 30000835, 30000580];
    
    for (const id of testIds) {
      const name = staticDb.getSystemName(id);
      logger.info('TEST', `System ${id}: ${name || 'NOT FOUND'}`);
    }
    
    const count = staticDb.query('SELECT COUNT(*) as count FROM mapSolarSystems');
    logger.info('TEST', `Total systems in DB: ${count[0]?.count || 0}`);
    
    return { ok: true };
  });

  registerAction('Inspect Char Data & Static DB', 'Dumps the char-data cache and tests static DB lookups', async () => {
    const staticDb = require('../esi/static-db');
    const charData = require('../pullers/char-data');
    
    await staticDb.initDb();
    const jitaTest = staticDb.getSystemName(30000142);
    logger.info('INSPECT', `Static DB test - Jita (30000142): ${jitaTest || 'NOT FOUND'}`);
    
    const cache = charData.getCache();
    const entries = Object.entries(cache);
    logger.info('INSPECT', `Char data cache has ${entries.length} entries`);
    
    for (const [id, data] of entries) {
      logger.info('INSPECT', `Character ${id}:`, {
        name: data.name,
        system_id: data.location?.solar_system_id,
        system_name: data.system_name,
        corp_id: data.corporation_id,
        corp_name: data.corporation_name,
        alliance_id: data.alliance_id,
        fetchedAt: data.fetchedAt ? new Date(data.fetchedAt).toISOString() : null
      });
    }
    
    return { ok: true, cacheSize: entries.length, jitaTest };
  });

  registerAction('Check Syncer Queue', 'Shows detailed syncer queue and active task info', async () => {
    const state = syncer.getState();
    logger.info('SYNCER', 'Queue state:', state);
    return state;
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
// main/scheduler.js
// VERSION: 1.5
'use strict';
const logger = require('./debug/logger');
const accounts = require('./accounts');
const charDataPuller = require('./pullers/char-data');
const walletDataPuller = require('./pullers/wallet-data');
const skillsDataPuller = require('./pullers/skills-data');
const clonesDataPuller = require('./pullers/clones-data');

const intervals = new Map();

function registerPuller(name, pullFn, intervalMs, startupPriority = 1) {
  logger.info('SCHEDULER', `Registering puller: ${name}`, { intervalMs, startupPriority });
  pullFn(startupPriority);
  const id = setInterval(() => pullFn(0), intervalMs);
  intervals.set(name, id);
}

function start() {
  logger.info('SCHEDULER', 'Starting scheduler');

  registerPuller('char-data', (p) => charDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 5 * 60 * 1000, 1);
  registerPuller('wallet-data', (p) => walletDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 15 * 60 * 1000, 2);
  registerPuller('skills-data', (p) => skillsDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 10 * 60 * 1000, 3);
  
  // Clones: Startup Pri 1, every 15 mins
  registerPuller('clones-data', (p) => clonesDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 15 * 60 * 1000, 1);
}

function stop() {
  for (const [name, id] of intervals) {
    clearInterval(id);
    logger.info('SCHEDULER', `Stopped puller: ${name}`);
  }
  intervals.clear();
}

function forcePull(name) {
  const accs = accounts.getAccounts().filter(a => !a.testPilot);
  if (name === 'char-data') charDataPuller.queuePull(accs, 2);
  else if (name === 'wallet-data') walletDataPuller.queuePull(accs, 2);
  else if (name === 'skills-data') skillsDataPuller.queuePull(accs, 2);
  else if (name === 'clones-data') clonesDataPuller.queuePull(accs, 2);
}

module.exports = { start, stop, forcePull };
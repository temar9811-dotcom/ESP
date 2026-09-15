// main/scheduler.js
// VERSION: 1.3
'use strict';
const logger = require('./debug/logger');
const accounts = require('./accounts');
const charDataPuller = require('./pullers/char-data');
const walletDataPuller = require('./pullers/wallet-data');
const skillsDataPuller = require('./pullers/skills-data');

const intervals = new Map();

function registerPuller(name, pullFn, intervalMs, startupPriority = 1) {
  logger.info('SCHEDULER', `Registering puller: ${name}`, { intervalMs, startupPriority });
  pullFn(startupPriority); // Startup pull
  const id = setInterval(() => pullFn(0), intervalMs); // Recurring pull (Priority 0)
  intervals.set(name, id);
}

function start() {
  logger.info('SCHEDULER', 'Starting scheduler');
  
  registerPuller('char-data', (priority) => {
    const accs = accounts.getAccounts().filter(a => !a.testPilot);
    charDataPuller.queuePull(accs, priority);
  }, 5 * 60 * 1000, 1); 

  registerPuller('wallet-data', (priority) => {
    const accs = accounts.getAccounts().filter(a => !a.testPilot);
    walletDataPuller.queuePull(accs, priority);
  }, 15 * 60 * 1000, 2); 

  registerPuller('skills-data', (priority) => {
    const accs = accounts.getAccounts().filter(a => !a.testPilot);
    skillsDataPuller.queuePull(accs, priority);
  }, 10 * 60 * 1000, 3); 
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
}

module.exports = { start, stop, forcePull };
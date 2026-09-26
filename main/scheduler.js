// main/scheduler.js
// VERSION: 1.8
'use strict';
const logger = require('./debug/logger');
const accounts = require('./accounts');
const charDataPuller = require('./pullers/char-data');
const walletDataPuller = require('./pullers/wallet-data');
const skillsDataPuller = require('./pullers/skills-data');
const clonesDataPuller = require('./pullers/clones-data');
const assetsDataPuller = require('./pullers/assets-data');
const notificationsDataPuller = require('./pullers/notifications-data');
const intervals = new Map();
const nextRuns = new Map();
const pullerMeta = new Map();

const INTERVALS = {
  'char-data': 5 * 60 * 1000,
  'wallet-data': 15 * 60 * 1000,
  'skills-data': 10 * 60 * 1000,
  'clones-data': 15 * 60 * 1000,
  'assets-data': 60 * 60 * 1000,
  'notifications-data': 5 * 60 * 1000
};

function registerPuller(name, pullFn, intervalMs, startupPriority = 1) {
  logger.info('SCHEDULER', `Registering puller: ${name}`, { intervalMs, startupPriority });
  pullFn(startupPriority);
  pullerMeta.set(name, { intervalMs });
  const tick = () => {
    nextRuns.set(name, Date.now() + intervalMs);
    pullFn(0);
  };
  nextRuns.set(name, Date.now() + intervalMs);
  intervals.set(name, setInterval(tick, intervalMs));
}
function start() {
logger.info('SCHEDULER', 'Starting scheduler');
registerPuller('char-data', (p) => charDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 5 * 60 * 1000, 1);
registerPuller('wallet-data', (p) => walletDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 15 * 60 * 1000, 2);
registerPuller('skills-data', (p) => skillsDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 10 * 60 * 1000, 3);
registerPuller('clones-data', (p) => clonesDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 15 * 60 * 1000, 1);
registerPuller('assets-data', (p) => assetsDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 60 * 60 * 1000, 4);
registerPuller('notifications-data', (p) => notificationsDataPuller.queuePull(accounts.getAccounts().filter(a => !a.testPilot), p), 5 * 60 * 1000, 1);
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
  else if (name === 'assets-data') assetsDataPuller.queuePull(accs, 2);
  else if (name === 'notifications-data') notificationsDataPuller.queuePull(accs, 2);
  const iv = INTERVALS[name];
  if (iv) nextRuns.set(name, Date.now() + iv);
}

function getNextRuns() {
  const out = {};
  for (const [name, next] of nextRuns) {
    out[name] = { next, intervalMs: (pullerMeta.get(name) || {}).intervalMs || INTERVALS[name] || 0 };
  }
  return out;
}

// Fraction of each puller's interval elapsed since its last run. A puller is
// eligible for a manual requeue once 50% of its timer has passed.
function getEligibility() {
  const now = Date.now();
  const out = [];
  for (const [name, next] of nextRuns) {
    const intervalMs = (pullerMeta.get(name) || {}).intervalMs || INTERVALS[name] || 0;
    if (!intervalMs) continue;
    const lastRun = next - intervalMs;
    const elapsed = Math.max(0, now - lastRun);
    const fraction = elapsed / intervalMs;
    out.push({ name, intervalMs, elapsed, next, fraction, eligible: fraction >= 0.5 });
  }
  return out;
}

// Requeue only the pullers whose timers are past 50%, resetting their next run.
// Returns which were pulled so callers can lock the refresh button when none
// qualified.
function requeueEligible() {
  const eligibility = getEligibility();
  const pulled = [];
  for (const e of eligibility) {
    if (!e.eligible) continue;
    forcePull(e.name);
    pulled.push(e.name);
  }
  return {
    anyEligible: pulled.length > 0,
    pulled,
    skipped: eligibility.filter((e) => !e.eligible).map((e) => e.name),
    eligibility
  };
}

module.exports = { start, stop, forcePull, getNextRuns, getEligibility, requeueEligible };
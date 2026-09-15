// File: main/esi/syncer.js | Version: 1.0
'use strict';
const logger = require('../debug/logger');
const { EsiError } = require('./fetcher');

let queue = [];
let isProcessing = false;
let isPaused = false;
const CONCURRENCY = 5; // Cap concurrency
let activeTasks = 0;

function enqueue(priority, taskFn) {
  queue.push({ priority, taskFn });
  // Sort descending: Higher number = Higher priority (Forced=2 > Startup=1 > Timer=0)
  queue.sort((a, b) => b.priority - a.priority); 
  processQueue();
}

async function processQueue() {
  if (isPaused || isProcessing) return;
  isProcessing = true;

  while (queue.length > 0 && activeTasks < CONCURRENCY) {
    const { priority, taskFn } = queue.shift();
    activeTasks++;
    
    Promise.resolve()
      .then(() => taskFn())
      .catch((err) => {
        if (err instanceof EsiError && (err.status === 420 || err.status === 429)) {
          logger.warn('SYNCER', 'Pausing queue due to rate limit');
          isPaused = true;
          // Back-off for 5 seconds before resuming
          setTimeout(() => { isPaused = false; processQueue(); }, 5000); 
        } else {
          logger.error('SYNCER', 'Task failed', { error: err.message });
        }
      })
      .finally(() => {
        activeTasks--;
        if (activeTasks === 0 && queue.length === 0) isProcessing = false;
        else processQueue();
      });
  }
  if (activeTasks >= CONCURRENCY) isProcessing = false; // Yield to event loop
}

module.exports = { enqueue, getState: () => ({ queued: queue.length, active: activeTasks, paused: isPaused }) };
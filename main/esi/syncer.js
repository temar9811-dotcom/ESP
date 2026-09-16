// main/esi/syncer.js
// VERSION: 1.1
'use strict';
const logger = require('../debug/logger');
const { EsiError } = require('./fetcher');

let queue = [];
let isPaused = false;
const CONCURRENCY = 5;
let activeTasks = 0;

function enqueue(priority, taskFn) {
  queue.push({ priority, taskFn });
  queue.sort((a, b) => b.priority - a.priority);
  processQueue();
}

function processQueue() {
  if (isPaused) return;
  if (activeTasks >= CONCURRENCY) return;
  if (queue.length === 0) return;
  
  while (queue.length > 0 && activeTasks < CONCURRENCY) {
    const { priority, taskFn } = queue.shift();
    activeTasks++;
    
    (async () => {
      try {
        await taskFn();
      } catch (err) {
        if (err instanceof EsiError && (err.status === 420 || err.status === 429)) {
          logger.warn('SYNCER', 'Pausing queue due to rate limit');
          isPaused = true;
          setTimeout(() => { isPaused = false; processQueue(); }, 5000);
        } else {
          logger.error('SYNCER', 'Task failed', { error: err.message });
        }
      } finally {
        activeTasks--;
        processQueue();
      }
    })();
  }
}

module.exports = { enqueue, getState: () => ({ queued: queue.length, active: activeTasks, paused: isPaused }) };
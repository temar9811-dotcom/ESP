'use strict';

// Serializes ESI pull sections so only one section talks to ESI at a time.
// A section calls acquire() before pulling and must release() when done.
// Waiting sections are granted the lock in FIFO order.

const debug = require('./debug');

let holder = null;
const waiters = [];

function acquire(section) {
  if (!holder) {
    holder = section;
    debug.log('sequencer', `${section} acquired the ESI lock`);
    return Promise.resolve();
  }

  debug.log(
    'sequencer',
    `${section} waiting for the ESI lock (held by ${holder}, ${waiters.length} queued)`
  );

  return new Promise((resolve) => {
    waiters.push({ section, resolve });
  });
}

function release(section) {
  if (holder !== section) return;

  holder = null;

  const next = waiters.shift();
  if (next) {
    holder = next.section;
    debug.log('sequencer', `${section} released the ESI lock -> ${next.section}`);
    next.resolve();
  } else {
    debug.log('sequencer', `${section} released the ESI lock (idle)`);
  }
}

function getState() {
  return {
    holder,
    waiting: waiters.map((w) => w.section)
  };
}

module.exports = {
  acquire,
  release,
  getState
};

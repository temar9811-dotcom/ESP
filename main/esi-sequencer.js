'use strict';

// Serializes ESI pull sections so only one section talks to ESI at a time.
// A section calls acquire() before pulling and must release() when done.
// Waiting sections are granted the lock in FIFO order.

let holder = null;
const waiters = [];

function acquire(section) {
  if (!holder) {
    holder = section;
    return Promise.resolve();
  }

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
    next.resolve();
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

// FILE: main/assets-throttle.js
// VERSION: 1.1.16-beta
'use strict';
const { esiFetch, getErrorLimitState } = require('../eve/http');

let lastStructureCallAt = 0;
const STRUCTURE_CALL_GAP_MS = 150;

async function throttledEsiFetch(url, token) {
  const wait = lastStructureCallAt + STRUCTURE_CALL_GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastStructureCallAt = Date.now();
  return esiFetch(url, token);
}

async function waitErrorBudget() {
  const { remain, resetAt } = getErrorLimitState();
  if (remain != null && remain <= 10 && resetAt && resetAt > Date.now()) {
    const waitMs = Math.min(resetAt - Date.now(), 60000);
    if (waitMs > 0) await new Promise((r) => setTimeout(r, waitMs));
  }
}

function isRateLimit(err) {
  return Boolean(err && (err.status === 420 || err.status === 429));
}

module.exports = {
  throttledEsiFetch,
  waitErrorBudget,
  isRateLimit
};
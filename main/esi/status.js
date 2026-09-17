// main/esi/status.js
// VERSION: 1.0
'use strict';
const logger = require('../debug/logger');
const fetcher = require('./fetcher');

const CHECK_INTERVAL_MS = 60 * 1000;
const STATUS_URL = 'https://esi.evetech.net/latest/status/?datasource=tranquility';

let timer = null;
let lastStatus = { ok: false, checkedAt: 0, error: 'Not checked yet', players: null, serverVersion: null, startTime: null };

async function check() {
  try {
    const res = await fetcher.request(STATUS_URL);
    const data = res.data || {};
    lastStatus = {
      ok: true,
      players: data.players != null ? Number(data.players) : null,
      serverVersion: data.server_version || null,
      startTime: data.start_time || null,
      checkedAt: Date.now(),
      error: null
    };
  } catch (err) {
    lastStatus = {
      ok: false,
      checkedAt: Date.now(),
      error: err?.message || String(err),
      players: null,
      serverVersion: null,
      startTime: null
    };
  }
  return lastStatus;
}

function start() {
  if (timer) return;
  check().catch(() => {});
  timer = setInterval(() => check().catch(() => {}), CHECK_INTERVAL_MS);
  logger.info('ESI-STATUS', 'Started ESI status checker', { intervalMs: CHECK_INTERVAL_MS });
}

function stop() {
  if (timer) { clearInterval(timer); timer = null; }
}

function getStatus() { return lastStatus; }

module.exports = { start, stop, check, getStatus };
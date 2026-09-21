// main/notification-history.js
// VERSION: 1.0
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('./debug/logger');

const CACHE_FILE = 'notification-history.json';
const MAX_PER_CHAR = 150;

let store = { notifications: {}, lastViewed: {} };
let loaded = false;

function getFilePath() {
  return path.join(app.getPath('userData'), CACHE_FILE);
}

function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = fs.readFileSync(getFilePath(), 'utf8');
    const data = JSON.parse(raw);
    store.notifications = data.notifications || {};
    store.lastViewed = data.lastViewed || {};
  } catch {
    store = { notifications: {}, lastViewed: {} };
  }
}

function save() {
  try {
    fs.writeFileSync(getFilePath(), JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    logger.error('NOTIF-HISTORY', 'Save failed', { error: err.message });
  }
}

function record(characterId, type, payload) {
  load();
  const id = String(characterId);
  if (!store.notifications[id]) store.notifications[id] = [];

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    type,
    timestamp: Date.now(),
    title: payload.title || '',
    message: payload.message || '',
    skillName: payload.skillName || null,
    level: payload.level ?? null,
    remainingMs: payload.remainingMs ?? null,
    amount: payload.amount ?? null,
    description: payload.description || null,
    characterName: payload.characterName || null,
  };

  store.notifications[id].push(entry);

  if (store.notifications[id].length > MAX_PER_CHAR) {
    store.notifications[id] = store.notifications[id].slice(-MAX_PER_CHAR);
  }

  save();
  logger.debug('NOTIF-HISTORY', `Recorded ${type} for char ${id}`);
}

function getUnseen(characterId) {
  load();
  const id = String(characterId);
  const lastViewed = store.lastViewed[id] || 0;
  const all = store.notifications[id] || [];
  return all.filter((e) => e.timestamp > lastViewed);
}

function getAll(characterId) {
  load();
  const id = String(characterId);
  return store.notifications[id] || [];
}

function markSeen(characterId) {
  load();
  const id = String(characterId);
  store.lastViewed[id] = Date.now();
  save();
}

function getLastViewed(characterId) {
  load();
  const id = String(characterId);
  return store.lastViewed[id] || 0;
}

function getUnseenCount(characterId) {
  return getUnseen(characterId).length;
}

function getAllUnseenCounts() {
  load();
  const counts = {};
  const now = Date.now();
  for (const [id, events] of Object.entries(store.notifications)) {
    const lastViewed = store.lastViewed[id] || 0;
    counts[id] = events.filter((e) => e.timestamp > lastViewed).length;
  }
  return counts;
}

function clearAll() {
  load();
  store = { notifications: {}, lastViewed: {} };
  save();
  logger.info('NOTIF-HISTORY', 'Cleared all notification history');
}

function getSummary() {
  load();
  const out = {};
  const now = Date.now();
  for (const [id, events] of Object.entries(store.notifications)) {
    const lastViewed = store.lastViewed[id] || 0;
    out[id] = {
      total: events.length,
      unseen: events.filter((e) => e.timestamp > lastViewed).length,
      lastViewed,
      types: events.reduce((acc, e) => { acc[e.type] = (acc[e.type] || 0) + 1; return acc; }, {})
    };
  }
  return out;
}

module.exports = {
  record,
  getUnseen,
  getAll,
  markSeen,
  getLastViewed,
  getUnseenCount,
  getAllUnseenCounts,
  clearAll,
  getSummary,
};

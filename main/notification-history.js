// main/notification-history.js
// VERSION: 1.2
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const logger = require('./debug/logger');

const CACHE_FILE = 'notification-history.json';
const LEGACY_HISTORY_FILE = 'skill-history.json';
const MAX_PER_CHAR = 150;

let store = { notifications: {}, lastViewed: {}, completions: {} };
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
    store.completions = data.completions || {};
  } catch {
    store = { notifications: {}, lastViewed: {}, completions: {} };
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
    timestamp: Number.isFinite(payload.timestamp) ? payload.timestamp : Date.now(),
    title: payload.title || '',
    message: payload.message || '',
    skillName: payload.skillName || null,
    level: payload.level ?? null,
    remainingMs: payload.remainingMs ?? null,
    amount: payload.amount ?? null,
    description: payload.description || null,
    characterName: payload.characterName || null,
    provisional: Boolean(payload.provisional),
    corrected: Boolean(payload.corrected),
    correctedFinish: payload.correctedFinish ?? null,
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
  store = { notifications: {}, lastViewed: {}, completions: {} };
  save();
  logger.info('NOTIF-HISTORY', 'Cleared all notification history and completion ledger');
}

// Completion dedupe ledger (D6), keyed `${skillId}:${finishedLevel}` per character.
function completionKey(skillId, level) {
  return `${skillId}:${level}`;
}

function getCompletion(characterId, skillId, level) {
  load();
  const id = String(characterId);
  return (store.completions[id] || {})[completionKey(skillId, level)] || null;
}

function setCompletion(characterId, skillId, level, entry) {
  load();
  const id = String(characterId);
  if (!store.completions[id]) store.completions[id] = {};
  const key = completionKey(skillId, level);
  store.completions[id][key] = { notifiedAt: Date.now(), ...entry };
  save();
  return store.completions[id][key];
}

function listPending(characterId) {
  load();
  const id = String(characterId);
  const map = store.completions[id] || {};
  return Object.entries(map)
    .filter(([, v]) => v && v.pendingReconcile !== false)
    .map(([key, v]) => ({ key, ...v }));
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

// Import the legacy pre-1.1.3 skill-history.json (dead store with real finish
// data, e.g. Through Sep 6 2026) into the completion ledger + notification
// history so the Recently Finished Skills panel has real data. Idempotent:
// keyed on the completion ledger, so re-imports are no-ops. Only imports for
// characters present in the current account list.
function importLegacySkillHistory({ includeIds } = {}) {
  load();
  let raw = null;
  let legacy = null;
  try {
    raw = fs.readFileSync(path.join(app.getPath('userData'), LEGACY_HISTORY_FILE), 'utf8');
    legacy = (typeof raw === 'string' && raw.trim()) ? JSON.parse(raw) : null;
  } catch {
    return 0;
  }
  if (!legacy || typeof legacy !== 'object') return 0;

  const wanted = includeIds ? new Set(includeIds.map((id) => String(id))) : null;
  let imported = 0;

  for (const [charId, entries] of Object.entries(legacy)) {
    if (wanted && !wanted.has(String(charId))) continue;
    if (!Array.isArray(entries)) continue;

    const seenKeys = new Set();
    for (const e of entries) {
      const skillId = Number(e.skillId);
      const level = Number(e.level);
      const finishedMs = e.finishedAt ? new Date(e.finishedAt).getTime() : NaN;
      if (!Number.isFinite(skillId) || !Number.isFinite(level) || !Number.isFinite(finishedMs)) continue;
      const dedupeKey = `${skillId}:${level}`;
      if (seenKeys.has(dedupeKey)) continue; // legacy file has duplicated rows
      seenKeys.add(dedupeKey);

      // Already recorded (live detection or prior import) → skip both
      // notification and ledger so we never double-count.
      const existing = (store.notifications[String(charId)] || []).find(
        (n) => n.type === 'skill-complete' && Number(n.skillId ?? n.skill_id) === skillId && Number(n.level) === level
      );
      if (existing) continue;
      if (getCompletion(charId, skillId, level)) continue;

      const name = e.skillName || `Skill ${skillId}`;
      record(String(charId), 'skill-complete', {
        title: 'Skill complete',
        message: `${name} L${level} finished training.`,
        skillName: name,
        level,
        provisional: false,
        corrected: false,
        timestamp: finishedMs
      });
      setCompletion(charId, skillId, level, { finishDate: finishedMs, provisional: false, pendingReconcile: false });
      imported += 1;
    }
  }

  if (imported > 0) {
    logger.info('NOTIF-HISTORY', `Imported ${imported} legacy skill completions`);
  }
  return imported;
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
  getCompletion,
  setCompletion,
  listPending,
  importLegacySkillHistory,
};

// main/completions.js
// VERSION: 1.0
'use strict';
// Scheduled skill-completion detector: watchdog fires at each character's cached
// finish_date (survives restarts and ESI outages); reconcile resolves
// provisional (outage) completions against the fresh queue and re-fires only
// when the actual finish shifts materially. Queue-warning/queue-empty are also
// driven from here on the scheduled path (D5-D8).
const logger = require('./debug/logger');

const WATCHDOG_INTERVAL_MS = 60 * 1000;
const CORRECTION_THRESHOLD_MS = 60 * 1000;
const STALE_CACHE_MS = 15 * 60 * 1000;

let watchdogTimer = null;
const startupNoTrainingPinged = new Set();

function accounts() { return require('./accounts'); }
function notificationHistory() { return require('./notification-history'); }
function helpers() { return require('../eve/dashboard-helpers'); }
function settings() { return require('./settings'); }
function skillsDataModule() { return require('./pullers/skills-data'); }

function cachedQueue(account) {
  try {
    const c = skillsDataModule().getCache()[String(account.characterId)];
    return (c && Array.isArray(c.queue)) ? c.queue : [];
  } catch (e) {
    return [];
  }
}

function isStale(account) {
  try {
    const c = skillsDataModule().getCache()[String(account.characterId)];
    if (!c || !c.fetchedAt) return true;
    return Date.now() - c.fetchedAt > STALE_CACHE_MS;
  } catch (e) {
    return true;
  }
}

function skillNameOf(skill) {
  return skill.skill_name || skill.skillName || `Skill ${skill.skill_id == null ? '?' : skill.skill_id}`;
}

function fire(account, skill, opts = {}) {
  const payload = {
    characterId: account.characterId,
    characterName: account.characterName || 'Unknown',
    skillName: skillNameOf(skill),
    level: skill.finished_level != null ? skill.finished_level : '?',
    provisional: Boolean(opts.provisional),
    corrected: Boolean(opts.corrected),
    correctedFinish: opts.correctedFinish || null
  };
  accounts().emitSkillCompleted(payload);
  const finishMs = opts.correctedFinish
    ? new Date(opts.correctedFinish).getTime()
    : (skill.finish_date ? new Date(skill.finish_date).getTime() : Date.now());
  notificationHistory().setCompletion(account.characterId, skill.skill_id, skill.finished_level, {
    finishDate: Number.isFinite(finishMs) ? finishMs : Date.now(),
    provisional: Boolean(opts.provisional),
    pendingReconcile: Boolean(opts.provisional) && !opts.corrected
  });
  logger.info('COMPLETIONS', `Fired skill-complete ${opts.corrected ? '(corrected) ' : ''}${opts.provisional ? '(provisional) ' : ''}for ${account.characterName}`, payload);
}

function checkCompletion(account) {
  const queue = cachedQueue(account);
  const active = helpers().getActiveSkill(queue) || account.activeSkill || null;
  const now = Date.now();
  const keyOf = (s) => s ? `${s.skill_id}:${s.finished_level}:${s.finish_date}` : 'none';

  if (account.lastSeenActiveSkill) {
    const last = account.lastSeenActiveSkill;
    const lastFinishTime = new Date(last.finish_date).getTime();
    if (!Number.isNaN(lastFinishTime) && lastFinishTime <= now && keyOf(last) !== keyOf(active)) {
      const already = notificationHistory().getCompletion(account.characterId, last.skill_id, last.finished_level);
      if (!already) {
        fire(account, last, { provisional: isStale(account) });
        if (!active && !account.ignoreNoTraining) accounts().emitQueueEmpty({ characterId: account.characterId, characterName: account.characterName || 'Unknown' });
      }
    }
  }
  account.lastSeenActiveSkill = active ? { ...active } : null;
}

function reconcile(account) {
  const pending = notificationHistory().listPending(account.characterId);
  if (!pending.length) return;
  const queue = cachedQueue(account);
  const freshBySkill = new Map();
  for (const q of queue) {
    const k = `${q.skill_id}:${q.finished_level}`;
    if (!freshBySkill.has(k)) freshBySkill.set(k, q);
  }
  const now = Date.now();
  for (const p of pending) {
    const { key, finishDate } = p;
    const parts = String(key).split(':');
    if (parts.length !== 2) continue;
    const skillId = Number(parts[0]);
    const level = parts[1];
    const resolved = { finishDate, provisional: true, pendingReconcile: false };
    const fresh = freshBySkill.get(key);
    let actualFinish = null;
    if (fresh && fresh.finish_date) {
      const f = new Date(fresh.finish_date).getTime();
      if (Number.isFinite(f)) actualFinish = f;
    } else if (!fresh) {
      // Rolled off: successor's start_date approximates the actual completion.
      const active = helpers().getActiveSkill(queue);
      if (active && active.start_date) {
        const f = new Date(active.start_date).getTime();
        if (Number.isFinite(f)) actualFinish = f;
      }
    }
    if (actualFinish == null) {
      // Cannot determine (queue empty or successor unknown). Treat as sent:
      // no correction possible without a concrete ESI value. Suppress.
      notificationHistory().setCompletion(account.characterId, skillId, level, resolved);
      continue;
    }
    const diff = Math.abs(actualFinish - (Number(finishDate) || 0)) || Infinity;
    if (diff > CORRECTION_THRESHOLD_MS) {
      fire(account, {
        skill_id: skillId,
        finished_level: level,
        skill_name: fresh && fresh.skill_name ? fresh.skill_name : null,
        finish_date: new Date(actualFinish).toISOString()
      }, { corrected: true, correctedFinish: actualFinish });
    } else {
      // Changed within threshold (or unchanged) → already sent; suppress.
      notificationHistory().setCompletion(account.characterId, skillId, level, resolved);
    }
  }
}

function checkQueueWarning(account) {
  if (account.testPilot) return;
  const current = settings().getSettings() || {};
  if (current.notifyQueueEmpty === false) return;
  const warnHours = Number(current.queueWarnHours ?? 24) || 24;
  const warnMs = warnHours * 60 * 60 * 1000;

  const queue = cachedQueue(account);
  const times = helpers().getQueueTimes(queue);
  const remainingMs = times.remainingMs;
  const hasQueue = queue.length > 0;
  if (!hasQueue || remainingMs <= 0 || remainingMs > warnMs || times.lastFinish == null) {
    account.lastQueueWarnKey = null;
    return;
  }
  const key = `${times.lastFinish}:${warnHours}`;
  if (account.lastQueueWarnKey === key) return;
  account.lastQueueWarnKey = key;
  accounts().emitQueueWarning({ characterId: account.characterId, characterName: account.characterName || 'Unknown', remainingMs });
  logger.info('COMPLETIONS', `Fired queue-warning for ${account.characterName}`, { remainingMs, warnHours });
}

function pingNoTrainingIfEmpty(account) {
  if (account.testPilot) return;
  const id = String(account.characterId);
  if (startupNoTrainingPinged.has(id)) return;
  if (account.ignoreNoTraining) return;
  const queue = cachedQueue(account);
  const active = helpers().getActiveSkill(queue) || account.activeSkill || null;
  const hasTraining = Boolean(active) || queue.length > 0;
  if (hasTraining) return;
  startupNoTrainingPinged.add(id);
  accounts().emitQueueEmpty({ characterId: account.characterId, characterName: account.characterName || 'Unknown' });
  logger.info('COMPLETIONS', `Fired no-training startup ping for ${account.characterName}`, { id });
}

function tick() {
  try {
    const accs = accounts().getAccounts();
    let changed = false;
    for (const acc of accs) {
      if (acc.testPilot) continue;
      const before = JSON.stringify({ seen: acc.lastSeenActiveSkill || null, warn: acc.lastQueueWarnKey || null });
      try {
        checkCompletion(acc);
        checkQueueWarning(acc);
      } catch (e) {
        logger.error('COMPLETIONS', 'Tick failed for character', { id: acc.characterId, error: e.message });
      }
      const after = JSON.stringify({ seen: acc.lastSeenActiveSkill || null, warn: acc.lastQueueWarnKey || null });
      if (before !== after) changed = true;
    }
    if (changed) accounts().saveAccounts();
  } catch (e) {
    logger.error('COMPLETIONS', 'Watchdog tick failed', { error: e.message });
  }
}

function onPulled(account) {
  try {
    const before = JSON.stringify({ seen: account.lastSeenActiveSkill || null, warn: account.lastQueueWarnKey || null });
    checkQueueWarning(account);
    checkCompletion(account);
    reconcile(account);
    pingNoTrainingIfEmpty(account);
    const after = JSON.stringify({ seen: account.lastSeenActiveSkill || null, warn: account.lastQueueWarnKey || null });
    if (before !== after) accounts().saveAccounts();
  } catch (e) {
    logger.error('COMPLETIONS', 'onPulled failed', { id: account && account.characterId, error: e.message });
  }
}

function start() {
  if (watchdogTimer) return;
  logger.info('COMPLETIONS', 'Starting completion watchdog', { intervalMs: WATCHDOG_INTERVAL_MS });
  tick();
  watchdogTimer = setInterval(tick, WATCHDOG_INTERVAL_MS);
}

function stop() {
  if (watchdogTimer) {
    clearInterval(watchdogTimer);
    watchdogTimer = null;
  }
}

module.exports = { start, stop, tick, onPulled, checkCompletion, reconcile, checkQueueWarning };
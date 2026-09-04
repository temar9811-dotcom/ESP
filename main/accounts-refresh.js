'use strict';
const settings = require('./settings');
const skillHistory = require('./skill-history');
const eve = require('../eve');

function applyDashboard(account, dashboard) {
  account.wallet = dashboard.wallet;
  account.activeSkill = dashboard.active;
  account.queue = dashboard.queue;
  account.nextSkill = dashboard.nextSkill || null;
  account.totalSp = dashboard.totalSp ?? null;
  account.queueTotalSpCost = dashboard.queueTotalSpCost ?? null;
  account.queueTotalTimeMs = dashboard.queueTotalTimeMs ?? 0;
  account.queueRemainingMs = dashboard.queueRemainingMs ?? 0;
  account.skillLevels = dashboard.skillLevels || {};
  account.location = dashboard.location || null;
  account.shipName = dashboard.shipName || null;
  account.shipType = dashboard.shipType || null;
  account.lastFetchedAt = dashboard.fetchedAt;
  account.lastError = null;
}

function checkSkillCompletion(account, dashboard, api) {
  const currentActive = dashboard.active || null;
  const now = Date.now();
  if (account.lastSeenActiveSkill) {
    const lastSkill = account.lastSeenActiveSkill;
    const lastFinishTime = new Date(lastSkill.finish_date).getTime();
    if (!Number.isNaN(lastFinishTime) && lastFinishTime <= now) {
      const lastKey = `${lastSkill.skill_id}-${lastSkill.finished_level}-${lastSkill.finish_date}`;
      const currentKey = currentActive
        ? `${currentActive.skill_id}-${currentActive.finished_level}-${currentActive.finish_date}`
        : 'none';
      if (lastKey !== currentKey) {
        skillHistory.recordCompletion(account.characterId, {
          skillId: lastSkill.skill_id,
          skillName: lastSkill.skillName || 'Unknown skill',
          level: lastSkill.finished_level || 0,
          finishedAt: lastSkill.finish_date
        });
        api.emitSkillCompleted({
          characterId: account.characterId,
          characterName: account.characterName || 'Unknown',
          skillName: lastSkill.skillName || 'Unknown skill',
          level: lastSkill.finished_level || '?'
        });
        if (!currentActive) {
          api.emitQueueEmpty({
            characterId: account.characterId,
            characterName: account.characterName || 'Unknown'
          });
        }
      }
    }
  }
  account.lastSeenActiveSkill = currentActive ? { ...currentActive } : null;
}

function checkQueueWarning(account, dashboard, api) {
  const current = settings.getSettings() || {};
  if (current.notifyQueueEmpty === false) return;
  const warnHours = Number(current.queueWarnHours ?? 24) || 24;
  const warnMs = warnHours * 60 * 60 * 1000;
  const remaining = Number(dashboard.queueRemainingMs || 0);
  const hasQueue = Boolean(dashboard.active) || (Array.isArray(dashboard.queue) && dashboard.queue.length > 0);
  if (!hasQueue || remaining <= 0 || remaining > warnMs) {
    account.lastQueueWarnKey = null;
    return;
  }
  const lastEntry = (Array.isArray(dashboard.queue) && dashboard.queue.length ? dashboard.queue[dashboard.queue.length - 1] : dashboard.active) || {};
  const key = `${lastEntry.finish_date || 'active'}:${warnHours}`;
  if (account.lastQueueWarnKey === key) return;
  account.lastQueueWarnKey = key;
  api.emitQueueWarning({
    characterId: account.characterId,
    characterName: account.characterName || 'Unknown',
    remainingMs: remaining
  });
}

async function refreshCharacter(account, api) {
  try {
    let token = await api.getValidAccessToken(account, false);
    const skillsSync = require('./skills-sync');
    const cachedSkills = skillsSync.getSkills(account.characterId);
    let dashboard;
    try {
      dashboard = await eve.getDashboard(account.characterId, token, cachedSkills);
    } catch (err) {
      if (err && err.status === 401) {
        token = await api.getValidAccessToken(account, true);
        dashboard = await eve.getDashboard(account.characterId, token, cachedSkills);
      } else {
        throw err;
      }
    }
    applyDashboard(account, dashboard);
    checkSkillCompletion(account, dashboard, api);
    checkQueueWarning(account, dashboard, api);
    skillHistory.seedFromQueue(account.characterId, dashboard.queue);
    account.recentCompletions = skillHistory.getRecent(account.characterId, 7);
  } catch (err) {
    account.lastError = err?.message || String(err);
    console.error('[ESI]', account.characterName || account.characterId, err?.status ?? '', err?.message || String(err));
    if (err && err.status === 420) {
      api.enterRateLimit(Number(err.resetSeconds) || 60);
    } else {
      await api.waitErrorBudget();
    }
  }
}

async function refreshAll(api) {
  if (api.isRefreshing()) return api.getPublicAccounts();
  api.setRefreshing(true);
  api.emitRefreshState();
  try {
    const queue = [...api.getAccounts()].filter((account) => !account.testPilot);
    const concurrency = Math.min(5, queue.length || 1);
    const workers = Array.from({ length: concurrency }, async () => {
      while (queue.length) {
        await api.waitRateLimit();
        const account = queue.shift();
        if (!account) break;
        await refreshCharacter(account, api);
      }
    });
    await Promise.allSettled(workers);
    if (api.getRateLimitedUntil() && api.getRateLimitedUntil() <= Date.now()) {
      api.setRateLimitedUntil(0);
    }
    api.broadcastAccounts();
    return api.getPublicAccounts();
  } finally {
    api.setRefreshing(false);
    api.emitRefreshState();
  }
}

module.exports = { refreshCharacter, refreshAll };
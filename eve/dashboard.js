// File: eve/dashboard.js | Version: 1.2
'use strict';
const { esiFetch } = require('./http');
const helpers = require('./dashboard-helpers');
const logger = require('../main/debug/logger');
const log = (msg, data) => logger.debug('DASHBOARD', msg, data);

async function getWallet(characterId, accessToken) {
  log(`getWallet:${characterId}`);
  return esiFetch(`/characters/${characterId}/wallet/`, accessToken);
}
async function getSkillQueue(characterId, accessToken) {
  log(`getSkillQueue:${characterId}`);
  return esiFetch(`/characters/${characterId}/skillqueue/`, accessToken);
}
async function getCharacterSkills(characterId, accessToken) {
  log(`getCharacterSkills:${characterId}`);
  return esiFetch(`/characters/${characterId}/skills/`, accessToken);
}
async function getCharacterLocation(characterId, accessToken) {
  log(`getCharacterLocation:${characterId}`);
  return esiFetch(`/characters/${characterId}/location/`, accessToken);
}
async function getCharacterShip(characterId, accessToken) {
  log(`getCharacterShip:${characterId}`);
  return esiFetch(`/characters/${characterId}/ship/`, accessToken);
}

async function getDashboard(characterId, accessToken, cachedSkills) {
  log(`start:${characterId}:cached=${Boolean(cachedSkills)}`);
  const [wallet, rawQueue] = await Promise.all([getWallet(characterId, accessToken), getSkillQueue(characterId, accessToken)]);
  let skills = cachedSkills || null; let location = null; let ship = null;
  if (!skills) { try { skills = await getCharacterSkills(characterId, accessToken); } catch { skills = null; } }
  try { location = await getCharacterLocation(characterId, accessToken); } catch { location = null; }
  try { ship = await getCharacterShip(characterId, accessToken); } catch { ship = null; }
  log(`raw:${characterId}:wallet=${wallet}:queue=${Array.isArray(rawQueue) ? rawQueue.length : 0}`);
  const queueBase = Array.isArray(rawQueue) ? [...rawQueue] : [];
  queueBase.sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));
  let names = new Map();
  try { names = await helpers.getTypeNames(queueBase.map((q) => q.skill_id)); } catch {}
  const namedQueue = queueBase.map((q) => ({ ...q, skillName: names.get(q.skill_id) || `Unknown ${q.skill_id}` }));
  let enrichedQueue; let totalSpCost = null;
  if (skills && Array.isArray(skills.skills)) {
    const skillsMap = new Map(skills.skills.map((s) => [s.skill_id, s]));
    const enriched = await helpers.enrichQueueWithSpCost(namedQueue, skillsMap);
    enrichedQueue = enriched.queue; totalSpCost = enriched.totalSpCost;
  } else {
    enrichedQueue = namedQueue.map((q) => ({ ...q, spCost: null }));
  }
  const active = helpers.getActiveSkill(enrichedQueue);
  const nextSkill = helpers.getNextSkill(enrichedQueue, active);
  const times = helpers.getQueueTimes(enrichedQueue);
  const totalSp = skills && typeof skills.total_sp === 'number' ? skills.total_sp : null;
  const skillLevels = {};
  if (skills && Array.isArray(skills.skills)) {
    for (const skill of skills.skills) skillLevels[skill.skill_id] = Number(skill.trained_skill_level ?? skill.active_skill_level ?? 0);
  }
  let locationName = null;
  try { locationName = await helpers.resolveLocationName(location, accessToken); } catch { locationName = null; }
  let shipType = null;
  if (ship && ship.ship_type_id) {
    try {
      const typeNames = await helpers.getTypeNames([ship.ship_type_id]);
      shipType = typeNames.get(ship.ship_type_id) || null;
    } catch { shipType = null; }
  }
  log(`done:${characterId}:queue=${enrichedQueue.length}:active=${active?.skillName || 'none'}`);
  return {
    wallet: Number(wallet || 0), active, queue: enrichedQueue, nextSkill, totalSp,
    queueTotalSpCost: totalSpCost, queueTotalTimeMs: times.totalDurationMs, queueRemainingMs: times.remainingMs,
    skillLevels, location: locationName, shipName: ship?.ship_name || null, shipType, fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  getDashboard, getCharacterSkills, getTypeNames: helpers.getTypeNames,
  getSkillIdsFromNames: helpers.getSkillIdsFromNames, resolveLocationName: helpers.resolveLocationName
};
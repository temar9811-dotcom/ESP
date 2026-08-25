'use strict';

const { esiFetch, publicFetch, publicPost } = require('./http');

async function getWallet(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/wallet/`, accessToken);
}

async function getSkillQueue(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/skillqueue/`, accessToken);
}

async function getCharacterSkills(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/skills/`, accessToken);
}

async function getCharacterLocation(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/location/`, accessToken);
}

async function getCharacterShip(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/ship/`, accessToken);
}

async function getTypeNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];

  if (unique.length === 0) return new Map();

  const arr = await publicPost('/universe/names/', unique);
  return new Map(arr.map((x) => [x.id, x.name]));
}

async function getSkillIdsFromNames(names) {
  const unique = [...new Set(names.filter(Boolean))];
  const map = new Map();

  if (!unique.length) return map;

  const data = await publicPost('/universe/ids/', unique);
  const inventoryTypes = Array.isArray(data.inventory_types)
    ? data.inventory_types
    : [];

  for (const item of inventoryTypes) {
    map.set(item.name, item.id);
  }

  return map;
}

function getActiveSkill(queue) {
  const now = Date.now();

  return (
    queue.find((q) => {
      const finish = new Date(q.finish_date).getTime();
      const start = q.start_date ? new Date(q.start_date).getTime() : 0;
      return finish > now && start <= now;
    }) ||
    queue.find(
      (q) => q.queue_position === 0 && new Date(q.finish_date).getTime() > now
    ) ||
    null
  );
}

function getNextSkill(queue, active) {
  const now = Date.now();

  const upcoming = queue.find((q) => {
    const start = q.start_date ? new Date(q.start_date).getTime() : null;
    return start != null && start > now;
  });

  if (upcoming) return upcoming;

  if (active) return null;

  return (
    queue.find((q) => {
      const finish = q.finish_date ? new Date(q.finish_date).getTime() : null;
      return finish != null && finish > now;
    }) || null
  );
}

async function resolveLocationName(location, accessToken) {
  if (!location) return null;

  if (location.structure_id) {
    try {
      const structure = await esiFetch(
        `/universe/structures/${location.structure_id}/`,
        accessToken
      );
      if (structure && structure.name) return structure.name;
    } catch {
      // fall through
    }
  }

  if (location.station_id) {
    try {
      const station = await publicFetch(
        `/universe/stations/${location.station_id}/`
      );
      if (station && station.name) return station.name;
    } catch {
      // fall through
    }
  }

  if (location.solar_system_id) {
    try {
      const system = await publicFetch(
        `/universe/systems/${location.solar_system_id}/`
      );
      if (system && system.name) return system.name;
    } catch {
      return null;
    }
  }

  return null;
}

const typeRankCache = new Map();
const typeRankInFlight = new Map();

function skillPointsAtLevel(rank, level) {
  const safeRank = Number(rank) > 0 ? Number(rank) : 1;
  const safeLevel = Number(level) || 0;

  if (safeLevel <= 0) return 0;

  return Math.round(250 * safeRank * Math.pow(Math.sqrt(32), safeLevel - 1));
}

async function getSkillRank(skillId) {
  if (typeRankCache.has(skillId)) return typeRankCache.get(skillId);
  if (typeRankInFlight.has(skillId)) return typeRankInFlight.get(skillId);

  const promise = (async () => {
    try {
      const data = await publicFetch(`/universe/types/${skillId}/`);

      const rankAttr = Array.isArray(data.dogma_attributes)
        ? data.dogma_attributes.find((attr) => attr.attribute_id === 275)
        : null;

      const rank = Number(rankAttr?.value);
      const safeRank = Number.isFinite(rank) && rank > 0 ? rank : 1;

      typeRankCache.set(skillId, safeRank);
      return safeRank;
    } catch {
      return 1;
    } finally {
      typeRankInFlight.delete(skillId);
    }
  })();

  typeRankInFlight.set(skillId, promise);
  return promise;
}

async function enrichQueueWithSpCost(queue, skillsMap) {
  const currentLevels = new Map();
  const currentSkillPoints = new Map();

  for (const skill of skillsMap.values()) {
    currentLevels.set(skill.skill_id, Number(skill.trained_skill_level ?? skill.active_skill_level ?? 0));
    currentSkillPoints.set(skill.skill_id, Number(skill.skillpoints_in_skill || 0));
  }

  let totalSpCost = 0;
  const enriched = [];

  for (const q of queue) {
    const skillId = q.skill_id;
    const toLevel = Number(q.finished_level || 0);
    const fromLevel = currentLevels.get(skillId) || 0;

    let spCost = null;

    if (toLevel > fromLevel) {
      const rank = await getSkillRank(skillId);
      const targetSp = skillPointsAtLevel(rank, toLevel);
      const baseSpForFromLevel = skillPointsAtLevel(rank, fromLevel);
      const knownSp = Math.max(
        currentSkillPoints.get(skillId) || 0,
        baseSpForFromLevel
      );

      spCost = Math.max(0, Math.round(targetSp - knownSp));
      totalSpCost += spCost;

      currentLevels.set(skillId, toLevel);
      currentSkillPoints.set(skillId, targetSp);
    } else {
      spCost = 0;
      currentLevels.set(skillId, Math.max(fromLevel, toLevel));
    }

    enriched.push({ ...q, spCost });
  }

  return { queue: enriched, totalSpCost };
}

function getQueueTimes(queue) {
  let totalDurationMs = 0;
  let previousFinish = null;
  let lastFinish = null;

  for (const q of queue) {
    const finish = q.finish_date ? new Date(q.finish_date).getTime() : null;
    let start = q.start_date ? new Date(q.start_date).getTime() : null;

    if (!start && previousFinish) start = previousFinish;
    if (start && finish && finish > start) totalDurationMs += finish - start;

    if (finish) {
      previousFinish = finish;
      if (!lastFinish || finish > lastFinish) lastFinish = finish;
    }
  }

  const now = Date.now();
  const remainingMs = lastFinish ? Math.max(0, lastFinish - now) : 0;

  return { totalDurationMs, remainingMs, lastFinish };
}

async function getDashboard(characterId, accessToken) {
  const [wallet, rawQueue] = await Promise.all([
    getWallet(characterId, accessToken),
    getSkillQueue(characterId, accessToken)
  ]);

  let skills = null;
  let location = null;
  let ship = null;

  try { skills = await getCharacterSkills(characterId, accessToken); } catch { skills = null; }
  try { location = await getCharacterLocation(characterId, accessToken); } catch { location = null; }
  try { ship = await getCharacterShip(characterId, accessToken); } catch { ship = null; }

  const queueBase = Array.isArray(rawQueue) ? [...rawQueue] : [];
  queueBase.sort((a, b) => (a.queue_position ?? 0) - (b.queue_position ?? 0));

  let names = new Map();
  try { names = await getTypeNames(queueBase.map((q) => q.skill_id)); } catch { /* ignore */ }

  const namedQueue = queueBase.map((q) => ({
    ...q,
    skillName: names.get(q.skill_id) || `Unknown ${q.skill_id}`
  }));

  let enrichedQueue;
  let totalSpCost = null;

  if (skills && Array.isArray(skills.skills)) {
    const skillsMap = new Map(skills.skills.map((skill) => [skill.skill_id, skill]));
    const enriched = await enrichQueueWithSpCost(namedQueue, skillsMap);
    enrichedQueue = enriched.queue;
    totalSpCost = enriched.totalSpCost;
  } else {
    enrichedQueue = namedQueue.map((q) => ({ ...q, spCost: null }));
  }

  const active = getActiveSkill(enrichedQueue);
  const nextSkill = getNextSkill(enrichedQueue, active);

  const times = getQueueTimes(enrichedQueue);

  const totalSp = skills && typeof skills.total_sp === 'number' ? skills.total_sp : null;

  const skillLevels = {};
  if (skills && Array.isArray(skills.skills)) {
    for (const skill of skills.skills) {
      skillLevels[skill.skill_id] = Number(skill.trained_skill_level ?? skill.active_skill_level ?? 0);
    }
  }

  let locationName = null;
  try { locationName = await resolveLocationName(location, accessToken); } catch { locationName = null; }

  let shipType = null;
  if (ship && ship.ship_type_id) {
    try {
      const typeNames = await getTypeNames([ship.ship_type_id]);
      shipType = typeNames.get(ship.ship_type_id) || null;
    } catch {
      shipType = null;
    }
  }

  return {
    wallet: Number(wallet || 0),
    active,
    queue: enrichedQueue,
    nextSkill,
    totalSp,
    queueTotalSpCost: totalSpCost,
    queueTotalTimeMs: times.totalDurationMs,
    queueRemainingMs: times.remainingMs,
    skillLevels,
    location: locationName,
    shipName: ship?.ship_name || null,
    shipType,
    fetchedAt: new Date().toISOString()
  };
}

module.exports = {
  getDashboard,
  getTypeNames,
  getSkillIdsFromNames,
  resolveLocationName
};
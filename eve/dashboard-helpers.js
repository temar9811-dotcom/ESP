// File: eve/dashboard-helpers.js | Version: 1.1
'use strict';
const { esiFetch, publicFetch, publicPost } = require('./http');
const logger = require('../main/debug-logger');
const log = (msg, data) => logger.debug('DASH-HELP', msg, data);

async function getTypeNames(ids) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return new Map();
  log(`getTypeNames:${unique.length}`);
  return new Map((await publicPost('/universe/names/', unique)).map((x) => [x.id, x.name]));
}
async function getSkillIdsFromNames(names) {
  const unique = [...new Set(names.filter(Boolean))]; const map = new Map();
  if (!unique.length) return map;
  log(`getSkillIdsFromNames:${unique.length}`);
  const data = await publicPost('/universe/ids/', unique);
  for (const item of Array.isArray(data.inventory_types) ? data.inventory_types : []) map.set(item.name, item.id);
  return map;
}
function getActiveSkill(queue) {
  const now = Date.now();
  return queue.find((q) => {
    const finish = new Date(q.finish_date).getTime();
    const start = q.start_date ? new Date(q.start_date).getTime() : 0;
    return finish > now && start <= now;
  }) || queue.find((q) => q.queue_position === 0 && new Date(q.finish_date).getTime() > now) || null;
}
function getNextSkill(queue, active) {
  const now = Date.now();
  const upcoming = queue.find((q) => q.start_date && new Date(q.start_date).getTime() > now);
  if (upcoming) return upcoming;
  if (active) return null;
  return queue.find((q) => q.finish_date && new Date(q.finish_date).getTime() > now) || null;
}
async function resolveLocationName(location, accessToken) {
  if (!location) return null;
  log('resolveLocationName', location);
  if (location.structure_id) {
    try { const s = await esiFetch(`/universe/structures/${location.structure_id}/`, accessToken); if (s?.name) return s.name; } catch {}
  }
  if (location.station_id) {
    try { const s = await publicFetch(`/universe/stations/${location.station_id}/`); if (s?.name) return s.name; } catch {}
  }
  if (location.solar_system_id) {
    try { const s = await publicFetch(`/universe/systems/${location.solar_system_id}/`); if (s?.name) return s.name; } catch {}
  }
  return null;
}
const typeRankCache = new Map(); const typeRankInFlight = new Map();
function skillPointsAtLevel(rank, level) {
  const r = Number(rank) > 0 ? Number(rank) : 1; const l = Number(level) || 0;
  return l <= 0 ? 0 : Math.round(250 * r * Math.pow(Math.sqrt(32), l - 1));
}
async function getSkillRank(skillId) {
  if (typeRankCache.has(skillId)) return typeRankCache.get(skillId);
  if (typeRankInFlight.has(skillId)) return typeRankInFlight.get(skillId);
  const p = (async () => {
    try {
      const data = await publicFetch(`/universe/types/${skillId}/`);
      const attr = Array.isArray(data.dogma_attributes) ? data.dogma_attributes.find((a) => a.attribute_id === 275) : null;
      const rank = Number(attr?.value); const safe = Number.isFinite(rank) && rank > 0 ? rank : 1;
      typeRankCache.set(skillId, safe); return safe;
    } catch { return 1; } finally { typeRankInFlight.delete(skillId); }
  })();
  typeRankInFlight.set(skillId, p); return p;
}
async function enrichQueueWithSpCost(queue, skillsMap) {
  log(`enrichQueue:${queue.length}`);
  const lvl = new Map(); const sp = new Map();
  for (const s of skillsMap.values()) { lvl.set(s.skill_id, Number(s.trained_skill_level ?? s.active_skill_level ?? 0)); sp.set(s.skill_id, Number(s.skillpoints_in_skill || 0)); }
  let totalSpCost = 0; const enriched = [];
  for (const q of queue) {
    const to = Number(q.finished_level || 0); const from = lvl.get(q.skill_id) || 0; let cost = null;
    if (to > from) {
      const rank = await getSkillRank(q.skill_id); const target = skillPointsAtLevel(rank, to);
      const known = Math.max(sp.get(q.skill_id) || 0, skillPointsAtLevel(rank, from));
      cost = Math.max(0, Math.round(target - known)); totalSpCost += cost; lvl.set(q.skill_id, to); sp.set(q.skill_id, target);
    } else { cost = 0; lvl.set(q.skill_id, Math.max(from, to)); }
    enriched.push({ ...q, spCost: cost });
  }
  return { queue: enriched, totalSpCost };
}
function getQueueTimes(queue) {
  let totalDurationMs = 0; let prev = null; let last = null;
  for (const q of queue) {
    const finish = q.finish_date ? new Date(q.finish_date).getTime() : null;
    let start = q.start_date ? new Date(q.start_date).getTime() : null;
    if (!start && prev) start = prev;
    if (start && finish && finish > start) totalDurationMs += finish - start;
    if (finish) { prev = finish; if (!last || finish > last) last = finish; }
  }
  return { totalDurationMs, remainingMs: last ? Math.max(0, last - Date.now()) : 0, lastFinish: last };
}
module.exports = { getTypeNames, getSkillIdsFromNames, getActiveSkill, getNextSkill, resolveLocationName, enrichQueueWithSpCost, getQueueTimes };
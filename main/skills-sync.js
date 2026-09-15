// File: main/skills-sync.js | Version: 1.0
'use strict';
const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const accounts = require('./accounts');
const skillMeta = require('./skill-meta');
const sequencer = require('./esi-sequencer');
const debugLogger = require('./debug-logger');
const eve = require('../eve');
const eveConfig = require('../eve/config');

const SECTION = 'skills';
let cache = null;
let pulling = false;
let started = false;
let timer = null;
let lastPullAt = null;
let nextPullAt = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function cacheFile() {
  return path.join(app.getPath('userData'), 'skills-cache.json');
}

function loadCache() {
  if (cache) return cache;
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {};
  } catch {
    data = {};
  }
  cache = {
    characters: data.characters && typeof data.characters === 'object' ? data.characters : {},
    catalog: data.catalog || null
  };
  debugLogger.debug('SKILLS', `Cache loaded: ${Object.keys(cache.characters).length} characters`);
  return cache;
}

function saveCache() {
  try {
    const file = cacheFile();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(loadCache()), 'utf8');
    debugLogger.debug('SKILLS', 'Cache saved');
  } catch (err) {
    debugLogger.error('SKILLS', 'Cache save failed', { error: err.message });
  }
}

function isPulling() {
  return pulling;
}

function getSkills(characterId) {
  const entry = loadCache().characters[String(characterId)];
  if (!entry || !Array.isArray(entry.skills)) return null;
  return {
    total_sp: entry.total_sp ?? 0,
    unallocated_sp: entry.unallocated_sp ?? 0,
    skills: entry.skills
  };
}

function getFetchedAt(characterId) {
  const entry = loadCache().characters[String(characterId)];
  return entry && entry.fetchedAt ? entry.fetchedAt : null;
}

function store(characterId, payload) {
  loadCache().characters[String(characterId)] = {
    total_sp: Number(payload?.total_sp) || 0,
    unallocated_sp: Number(payload?.unallocated_sp) || 0,
    skills: Array.isArray(payload?.skills) ? payload.skills : [],
    fetchedAt: new Date().toISOString()
  };
  debugLogger.debug('SKILLS', `Stored ${payload?.skills?.length || 0} skills for character ${characterId}`);
}

function removeCharacter(characterId) {
  if (cache && cache.characters) {
    delete cache.characters[String(characterId)];
    saveCache();
  }
}

async function fetchOne(account, token) {
  try {
    return await eve.getCharacterSkills(account.characterId, token);
  } catch (err) {
    if (err && err.status === 401) {
      const fresh = await accounts.getValidAccessToken(account, true);
      return eve.getCharacterSkills(account.characterId, fresh);
    }
    throw err;
  }
}

async function pull() {
  if (pulling) {
    debugLogger.debug('SKILLS', 'Pull requested while one is already running — skipped');
    return { skipped: true };
  }
  pulling = true;
  lastPullAt = Date.now();
  debugLogger.info('SKILLS', 'Pull starting — acquiring the ESI sequencer');
  await sequencer.acquire(SECTION);
  const errors = {};
  let pulled = 0;
  try {
    const list = accounts.getAccounts();
    debugLogger.info('SKILLS', `Pulling skills for ${list.length} character(s)`);
    const tasks = [];
    for (const account of list) {
      try {
        const token = await accounts.getValidAccessToken(account, false);
        tasks.push({ account, token });
      } catch (err) {
        errors[account.characterId] = err?.message || String(err);
        debugLogger.error('SKILLS', `Token refresh failed for ${account.characterName || account.characterId}`, { error: err?.message });
      }
    }
    const batchSize = Math.max(1, Number(eveConfig.SKILLS?.batchSize) || 10);
    const batchDelay = Math.max(0, Number(eveConfig.SKILLS?.batchDelayMs) || 0);
    const batchCount = Math.ceil(tasks.length / batchSize);
    for (let i = 0; i < tasks.length; i += batchSize) {
      const batchNumber = i / batchSize + 1;
      await accounts.waitRateLimit();
      await accounts.waitErrorBudget();
      const batch = tasks.slice(i, i + batchSize);
      debugLogger.info('SKILLS', `ESI GET /characters/*/skills batch ${batchNumber}/${batchCount} (${batch.length} call(s))`);
      const results = await Promise.allSettled(
        batch.map(({ account, token }) => fetchOne(account, token))
      );
      results.forEach((result, index) => {
        const { account } = batch[index];
        const name = account.characterName || account.characterId;
        if (result.status === 'fulfilled') {
          store(account.characterId, result.value);
          pulled += 1;
          debugLogger.info('SKILLS', `${name}: ${result.value?.skills?.length ?? 0} skills, ${result.value?.total_sp ?? 0} SP`);
        } else {
          const err = result.reason;
          errors[account.characterId] = err?.message || String(err);
          debugLogger.error('SKILLS', `${name}: pull failed`, { status: err?.status, error: err?.message });
          if (err && err.status === 420) {
            accounts.enterRateLimit(Number(err.resetSeconds) || 60);
            debugLogger.warn('SKILLS', `ESI 420 — entering rate-limit cooldown for ${Number(err.resetSeconds) || 60}s`);
          }
        }
      });
      if (i + batchSize < tasks.length) {
        debugLogger.debug('SKILLS', `Pausing ${batchDelay}ms before the next batch`);
        await sleep(batchDelay);
      }
    }
    saveCache();
    debugLogger.info('SKILLS', `Cache saved (${pulled} pulled, ${Object.keys(errors).length} failed)`);
    accounts.broadcastAccounts();
  } finally {
    sequencer.release(SECTION);
    pulling = false;
  }
  debugLogger.info('SKILLS', `Pull finished — ${pulled} pulled, ${Object.keys(errors).length} failed`);
  return { pulled, errors };
}

function start() {
  if (started) return;
  started = true;
  debugLogger.info('SKILLS', 'Startup skills pull scheduled');
  pull().catch((err) => debugLogger.error('SKILLS', 'Startup pull failed', { error: err?.message }));
  const interval = Math.max(60000, Number(eveConfig.SKILLS?.intervalMs) || 900000);
  nextPullAt = Date.now() + interval;
  timer = setInterval(() => {
    debugLogger.debug('SKILLS', 'Scheduled pull timer fired');
    nextPullAt = Date.now() + interval;
    pull().catch((err) => debugLogger.error('SKILLS', 'Scheduled pull failed', { error: err?.message }));
  }, interval);
  if (timer.unref) timer.unref();
}

function getSyncState() {
  return {
    pulling,
    lastPullAt,
    nextPullAt,
    intervalMs: Math.max(60000, Number(eveConfig.SKILLS?.intervalMs) || 900000)
  };
}

function resetCache() {
  cache = null;
}

function stop() {
  if (timer) clearInterval(timer);
  timer = null;
  started = false;
}

async function ensureCatalog() {
  const c = loadCache();
  if (c.catalog && c.catalog.groups && c.catalog.skillGroup) {
    return c.catalog;
  }
  const groups = {};
  const skillGroup = {};
  debugLogger.info('SKILLS', 'Building skill catalog from the public ESI routes');
  const category = await eve.publicFetch('/universe/categories/16/');
  const groupIds = Array.isArray(category?.groups) ? category.groups : [];
  for (const groupId of groupIds) {
    try {
      const group = await eve.publicFetch(`/universe/groups/${groupId}/`);
      if (!group) continue;
      groups[groupId] = group.name || `Group ${groupId}`;
      for (const typeId of group.types || []) {
        skillGroup[typeId] = groupId;
      }
    } catch {
      // Skip groups that fail to resolve
    }
  }
  c.catalog = { groups, skillGroup };
  saveCache();
  debugLogger.info('SKILLS', `Skill catalog built: ${Object.keys(groups).length} groups, ${Object.keys(skillGroup).length} skills mapped`);
  return c.catalog;
}

async function getGroupedSkills(characterId) {
  const cached = getSkills(characterId);
  const fetchedAt = getFetchedAt(characterId);
  if (!cached) {
    return { cached: false, pulling: isPulling(), fetchedAt: null, groups: [] };
  }
  let catalog = null;
  try {
    catalog = await ensureCatalog();
  } catch {
    catalog = null;
  }
  const ids = cached.skills.map((s) => s.skill_id);
  let names = new Map();
  let meta = {};
  try {
    names = await skillMeta.resolveNames(ids);
    meta = await skillMeta.getMetaForIds(ids);
  } catch {
    // Names/ranks are cosmetic — fall back to raw ids.
  }
  const byGroup = new Map();
  for (const skill of cached.skills) {
    const groupId = catalog?.skillGroup?.[skill.skill_id] ?? 0;
    if (!byGroup.has(groupId)) byGroup.set(groupId, []);
    byGroup.get(groupId).push({
      id: skill.skill_id,
      name: names.get(skill.skill_id) || `Skill ${skill.skill_id}`,
      level: Number(skill.trained_skill_level ?? skill.active_skill_level ?? 0),
      sp: Number(skill.skillpoints_in_skill) || 0,
      rank: meta[skill.skill_id]?.rank ?? null
    });
  }
  const groups = [...byGroup.entries()]
    .map(([id, skills]) => ({
      id,
      name: id === 0 ? 'Other' : catalog?.groups?.[id] || `Group ${id}`,
      skills: skills.sort((a, b) => a.name.localeCompare(b.name))
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    cached: true,
    pulling: isPulling(),
    fetchedAt,
    totalSp: cached.total_sp,
    unallocatedSp: cached.unallocated_sp,
    groups
  };
}

module.exports = {
  start,
  stop,
  pull,
  isPulling,
  getSyncState,
  resetCache,
  getSkills,
  getFetchedAt,
  getGroupedSkills,
  removeCharacter
};
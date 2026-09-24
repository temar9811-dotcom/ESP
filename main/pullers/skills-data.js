// main/pullers/skills-data.js
// VERSION: 1.2
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const staticDb = require('../esi/static-db');

const CACHE_FILE = 'skills-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('SKILLS-DATA', 'Save failed', { error: e.message }); }
}

async function pullCharacter(account) {
  loadCache();
  await staticDb.initDb(); // Ensure DB is loaded

  const baseUrl = 'https://esi.evetech.net/latest';
  const skillsUrl = `${baseUrl}/characters/${account.characterId}/skills/?datasource=tranquility`;
  const queueUrl = `${baseUrl}/characters/${account.characterId}/skillqueue/?datasource=tranquility`;
  const attributesUrl = `${baseUrl}/characters/${account.characterId}/attributes/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try { return await fetcher.request(url, token); } 
    catch (err) {
      if (err.status === 401) {
        logger.warn('SKILLS-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const [skillsRes, queueRes, attributesRes] = await Promise.allSettled([
    makeRequest(skillsUrl), makeRequest(queueUrl), makeRequest(attributesUrl)
  ]);

  if (skillsRes.status !== 'fulfilled' || queueRes.status !== 'fulfilled') {
    const skillsErr = skillsRes.status === 'fulfilled' ? null : skillsRes.reason;
    const queueErr = queueRes.status === 'fulfilled' ? null : queueRes.reason;
    const err = skillsErr || queueErr;
    throw err;
  }

  const skillsDataRaw = skillsRes.value.data;
  const queueRaw = queueRes.value.data;

  // Attributes are cached purely for future features (D4); a failure here
  // must not fail the whole skills pull.
  const attributes = attributesRes.status === 'fulfilled'
    ? (attributesRes.value?.data || null)
    : (() => {
        logger.warn('SKILLS-DATA', 'Attributes fetch failed', { id: account.characterId, error: attributesRes.reason?.message });
        return null;
      })();

  // Enrich skills with names and groups from Static DB
  const enrichedSkills = skillsDataRaw.skills.map(s => {
    const info = staticDb.getSkillInfo(s.skill_id);
    return {
      ...s,
      skill_name: info?.name || `Skill ${s.skill_id}`,
      group_name: info?.groupName || 'Unknown Group'
    };
  });

  // Enrich queue with skill names
  const enrichedQueue = queueRaw.map(q => {
    const info = staticDb.getSkillInfo(q.skill_id);
    return { ...q, skill_name: info?.name || `Skill ${q.skill_id}` };
  });

  const data = {
    total_sp: skillsDataRaw.total_sp,
    unallocated_sp: skillsDataRaw.unallocated_sp,
    skills: enrichedSkills,
    queue: enrichedQueue,
    attributes,
    fetchedAt: Date.now()
  };
  
  cache[account.characterId] = data;
  saveCache();
  require('../snapshots').broadcastSnapshot(account.characterId);
  logger.info('SKILLS-DATA', `Updated skills for ${account.characterName}`, { id: account.characterId, total_sp: data.total_sp, queue_len: data.queue.length });
  try { require('../completions').onPulled(account); } catch (e) { logger.error('SKILLS-DATA', 'completions.onPulled failed', { id: account.characterId, error: e.message }); }
  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('SKILLS-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
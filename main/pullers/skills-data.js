// main/pullers/skills-data.js
// VERSION: 1.0
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');

const CACHE_FILE = 'skills-data-cache.json';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    cache = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch { cache = {}; }
}

function saveCache() {
  try {
    const p = path.join(app.getPath('userData'), CACHE_FILE);
    fs.writeFileSync(p, JSON.stringify(cache, null, 2));
  } catch (e) { logger.error('SKILLS-DATA', 'Save cache failed', { error: e.message }); }
}

async function pullCharacter(account) {
  loadCache();
  const baseUrl = 'https://esi.evetech.net/latest';
  const skillsUrl = `${baseUrl}/characters/${account.characterId}/skills/?datasource=tranquility`;
  const queueUrl = `${baseUrl}/characters/${account.characterId}/skillqueue/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try {
      return await fetcher.request(url, token);
    } catch (err) {
      if (err.status === 401) {
        logger.warn('SKILLS-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const skillsRes = await makeRequest(skillsUrl);
  const queueRes = await makeRequest(queueUrl);

  const data = {
    total_sp: skillsRes.data.total_sp,
    unallocated_sp: skillsRes.data.unallocated_sp,
    skills: skillsRes.data.skills,
    queue: queueRes.data,
    fetchedAt: Date.now()
  };
  
  cache[account.characterId] = data;
  saveCache();
  logger.info('SKILLS-DATA', `Updated skills for ${account.characterName}`, { id: account.characterId, total_sp: data.total_sp, queue_len: data.queue.length });
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
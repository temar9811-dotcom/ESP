// main/pullers/notifications-data.js
// VERSION: 1.1
'use strict';
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const syncer = require('../esi/syncer');
const fetcher = require('../esi/fetcher');
const logger = require('../debug/logger');
const accounts = require('../accounts');
const universeNames = require('./universe-names');

const CACHE_FILE = 'notifications-data-cache.json';
const NOTIFICATIONS_SCOPE = 'esi-characters.read_notifications.v1';
let cache = {};
let cacheLoaded = false;

function loadCache() {
  if (cacheLoaded) return;
  cacheLoaded = true;
  try { cache = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), CACHE_FILE), 'utf8')); } catch { cache = {}; }
}

function saveCache() {
  try { fs.writeFileSync(path.join(app.getPath('userData'), CACHE_FILE), JSON.stringify(cache, null, 2)); } catch (e) { logger.error('NOTIFS-DATA', 'Save failed', { error: e.message }); }
}

function hasScope(account) {
  const scopes = accounts.ensureScopes(account);
  if (!Array.isArray(scopes)) return true;
  return scopes.includes(NOTIFICATIONS_SCOPE);
}

async function pullCharacter(account, priority) {
  loadCache();

  if (!hasScope(account)) {
    logger.debug('NOTIFS-DATA', `Skipping ${account.characterName}: missing notification scope`);
    return null;
  }

  const baseUrl = 'https://esi.evetech.net/latest';
  const notifsUrl = `${baseUrl}/characters/${account.characterId}/notifications/?datasource=tranquility`;

  let token = await accounts.getValidAccessToken(account, false);

  async function makeRequest(url) {
    try { return await fetcher.request(url, token); }
    catch (err) {
      if (err.status === 401) {
        logger.warn('NOTIFS-DATA', 'Token expired (401), forcing refresh', { id: account.characterId });
        token = await accounts.getValidAccessToken(account, true);
        return await fetcher.request(url, token);
      }
      throw err;
    }
  }

  const res = await makeRequest(notifsUrl);
  const raw = Array.isArray(res.data) ? res.data : [];
  const notifications = raw
    .slice()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .map((n) => ({
      notification_id: n.notification_id,
      sender_id: n.sender_id,
      sender_type: n.sender_type,
      type: n.type,
      date: n.date,
      is_read: Boolean(n.is_read),
      text: n.text || ''
    }));

  const data = { notifications, fetchedAt: Date.now() };
  cache[account.characterId] = data;
  saveCache();

  const unseen = notifications.filter((n) => !n.is_read).length;
  logger.info('NOTIFS-DATA', `Updated notifications for ${account.characterName}`, { id: account.characterId, count: notifications.length, unseen });

  const senderIds = [...new Set(raw.map((n) => n.sender_id).filter((id) => typeof id === 'number' && id > 0))];
  if (senderIds.length > 0) universeNames.queueResolution(senderIds, priority);

  require('../snapshots').broadcastSnapshot(account.characterId);

  return data;
}

function queuePull(accountsList, priority = 0) {
  loadCache();
  logger.info('NOTIFS-DATA', `Queuing pull for ${accountsList.length} chars`, { priority });
  for (const acc of accountsList) {
    if (acc.testPilot) continue;
    syncer.enqueue(priority, () => pullCharacter(acc, priority));
  }
}

module.exports = { queuePull, getCache: () => { loadCache(); return cache; } };
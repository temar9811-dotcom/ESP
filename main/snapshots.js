// main/snapshots.js
// VERSION: 1.1
'use strict';
const logger = require('./debug/logger');
const windowTray = require('./window-tray');
const notificationHistory = require('./notification-history');
const { getActiveSkill, calcSkillProgress } = require('../eve/dashboard-helpers');

const CHANNEL = 'data:updated';
const DEBOUNCE_MS = 2000;
const NOTIFICATIONS_SCOPE = 'esi-characters.read_notifications.v1';
const CAPS = { journal: 50, transactions: 25, notifications: 50 };
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

const timers = new Map();
const lastSnapshots = new Map();

function sendToRenderer(payload) {
  try {
    const win = windowTray.getWindow();
    if (win && !win.isDestroyed()) win.webContents.send(CHANNEL, payload);
  } catch {
    // Window not ready; renderer seeds on demand.
  }
}

function hashable(snapshot) {
  const clone = JSON.parse(JSON.stringify(snapshot));
  delete clone.ts;
  const strip = (o) => {
    for (const k of Object.keys(o)) {
      if (k === 'fetchedAt') { delete o[k]; continue; }
      if (o[k] && typeof o[k] === 'object') strip(o[k]);
    }
  };
  strip(clone);
  return clone;
}

function hashSnapshot(snapshot) {
  let h = 2166136261;
  const s = JSON.stringify(hashable(snapshot));
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

function senderKind(type) {
  if (type === 'corporation') return 'Corp';
  if (type === 'alliance') return 'Alliance';
  if (type === 'faction') return 'Faction';
  if (type === 'system') return 'System';
  if (type === 'structure') return 'Structure';
  return 'Character';
}

function resolveSender(n, names) {
  const cached = names[n.sender_id];
  return {
    sender_name: cached || `#${n.sender_id}`,
    sender_kind: cached ? senderKind(n.sender_type) : (n.sender_type || 'Unknown')
  };
}

function buildSnapshot(characterId) {
  const id = String(characterId);

  const charData = require('./pullers/char-data').getCache()[id];
  const walletData = require('./pullers/wallet-data').getCache()[id];
  const skillsData = require('./pullers/skills-data').getCache()[id];
  const clonesData = require('./pullers/clones-data').getCache()[id];
  const notifData = require('./pullers/notifications-data').getCache()[id];
  const names = require('./pullers/universe-names').getCache();
  const structNames = require('./pullers/structure-names').getCache();

  if (!charData && !walletData && !skillsData && !clonesData && !notifData) return null;

  const accounts = require('./accounts');
  const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(id)) || null;

  const queue = skillsData?.queue || account?.queue || [];
  const activeSkill = getActiveSkill(queue) || account?.activeSkill || null;
  const progress = calcSkillProgress(activeSkill);
  const walletBalance = Number(walletData?.balance ?? account?.wallet ?? 0);

  const corpName = names[charData?.corporation_id] || (charData?.corporation_id ? `Corp ${charData.corporation_id}` : 'Unknown');
  const allianceName = names[charData?.alliance_id] || (charData?.alliance_id ? `Alliance ${charData.alliance_id}` : 'No Alliance');
  const systemName = charData?.system_name || (charData?.location?.solar_system_id ? `System ${charData.location.solar_system_id}` : 'Unknown');

  const homeLoc = clonesData?.home_location;
  const homeLocationType = homeLoc?.location_type === 'structure' ? 'Citadel' : 'Station';
  const homeLocationName = homeLoc
    ? (homeLoc.location_type === 'structure'
        ? (structNames[homeLoc.location_id]?.name || `Structure ${homeLoc.location_id}`)
        : (names[homeLoc.location_id] || 'Unknown Station'))
    : null;

  const rawFinished = notificationHistory.getAll(id)
    .filter((e) => e.type === 'skill-complete')
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 5)
    .map((e) => ({ skillName: e.skillName || e.message || 'Skill', level: e.level ?? null, timestamp: e.timestamp }));

  let moneyIn7d = 0, moneyOut7d = 0;
  const cutoff = Date.now() - SEVEN_DAYS;
  for (const e of walletData?.journal || []) {
    const t = new Date(e.date).getTime();
    if (Number.isNaN(t) || t < cutoff) continue;
    const amt = Number(e.amount || 0);
    if (amt > 0) moneyIn7d += amt;
    else moneyOut7d += Math.abs(amt);
  }
  const net7d = moneyIn7d - moneyOut7d;

  const journal = (walletData?.journal || []).slice(0, CAPS.journal).map((e) => {
    const name = names[e.first_party_id];
    if (name) return { ...e, party_name: name };
    if (e.first_party_id == null) return { ...e, party_name: 'Unknown party' };
    return { ...e, party_name: null };
  });

  const jumpClones = (clonesData?.jump_clones || []).map((clone) => ({
    location_id: clone.location_id,
    location_type: clone.location_type,
    name: clone.location_type === 'structure'
      ? (structNames[clone.location_id]?.name || `Structure ${clone.location_id}`)
      : (names[clone.location_id] || 'Unknown Station'),
    type: clone.location_type === 'structure' ? 'Citadel' : 'Station',
    implants: (clone.implant || []).map((implantId) => names[implantId] || `Implant ${implantId}`)
  }));

  const allNotifs = notifData?.notifications || [];
  let notificationsUnavailable = null;
  if (!notifData) {
    const scopes = account ? accounts.ensureScopes(account) : null;
    notificationsUnavailable = (Array.isArray(scopes) && !scopes.includes(NOTIFICATIONS_SCOPE)) ? 'no-scope' : 'not-pulled';
  }
  const notifications = {
    items: allNotifs.slice(0, CAPS.notifications).map((n) => ({
      notification_id: n.notification_id,
      type: n.type,
      date: n.date,
      is_read: Boolean(n.is_read),
      text: n.text || '',
      sender_id: n.sender_id,
      sender_type: n.sender_type,
      ...resolveSender(n, names)
    })),
    unseen: allNotifs.filter((n) => !n.is_read).length,
    unavailable: notificationsUnavailable
  };

  return {
    characterId: Number(id),
    ts: Date.now(),
    overview: {
      activeSkill,
      progress,
      queueLength: queue.length,
      queueRemainingMs: account?.queueRemainingMs ?? 0,
      walletBalance,
      corpName,
      allianceName,
      systemName,
      shipName: account?.shipName || null,
      shipType: account?.shipType || null,
      homeLocationType,
      homeLocationName,
      jumpCloneCount: (clonesData?.jump_clones || []).length,
      finishedSkills: rawFinished
    },
    wallet: {
      balance: walletBalance,
      inOutNet7d: { in: moneyIn7d, out: moneyOut7d, net: net7d },
      journal,
      transactions: (walletData?.transactions || []).slice(0, CAPS.transactions),
      fetchedAt: walletData?.fetchedAt || null
    },
    clones: {
      home: homeLoc
        ? { location_id: homeLoc.location_id, location_type: homeLoc.location_type, name: homeLocationName, type: homeLocationType }
        : null,
      last_clone_jump_date: clonesData?.last_clone_jump_date || null,
      last_station_change_date: clonesData?.last_station_change_date || null,
      jumpClones
    },
    notifications
  };
}

function flush(characterId) {
  const id = String(characterId);
  timers.delete(id);
  const snapshot = buildSnapshot(id);
  if (!snapshot) return;
  const h = hashSnapshot(snapshot);
  const prev = lastSnapshots.get(id);
  if (prev && prev.hash === h) return;
  lastSnapshots.set(id, { hash: h });
  sendToRenderer(snapshot);
}

function broadcastSnapshot(characterId) {
  const id = String(characterId);
  const existing = timers.get(id);
  if (existing) clearTimeout(existing);
  timers.set(id, setTimeout(() => flush(id), DEBOUNCE_MS));
}

function broadcastAll() {
  try {
    const accounts = require('./accounts').getAccounts();
    for (const acc of accounts) {
      if (acc.testPilot) continue;
      broadcastSnapshot(acc.characterId);
    }
  } catch {
    // Accounts not ready yet; pullers will trigger broadcasts on their own.
  }
}

function invalidateCache() {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  lastSnapshots.clear();
}

function shutdown() {
  invalidateCache();
}

module.exports = { buildSnapshot, broadcastSnapshot, broadcastAll, invalidateCache, shutdown };
'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const { esiFetch, publicFetch } = require('./http');

let marketPriceCache = null;

const implantSlotCache = new Map();
const implantSlotInFlight = new Map();

function implantSlotsFile() {
  return path.join(app.getPath('userData'), 'implant-slots.json');
}

function loadImplantSlotCache() {
  try {
    const data = JSON.parse(fs.readFileSync(implantSlotsFile(), 'utf8')) || {};
    for (const [k, v] of Object.entries(data)) {
      implantSlotCache.set(Number(k), v);
    }
  } catch { /* fresh cache */ }
}

function saveImplantSlotCache() {
  try {
    const obj = {};
    for (const [k, v] of implantSlotCache) obj[k] = v;
    fs.mkdirSync(path.dirname(implantSlotsFile()), { recursive: true });
    fs.writeFileSync(implantSlotsFile(), JSON.stringify(obj, null, 2), 'utf8');
  } catch { /* ignore */ }
}

async function getClones(characterId, accessToken) {
  return esiFetch(`/characters/${characterId}/clones/`, accessToken);
}

async function getMarketPrices() {
  if (marketPriceCache) return marketPriceCache;

  const arr = await publicFetch('/markets/prices/');
  marketPriceCache = new Map();

  for (const entry of arr || []) {
    marketPriceCache.set(entry.type_id, {
      adjustedPrice: entry.adjusted_price || 0,
      averagePrice: entry.average_price || 0
    });
  }

  return marketPriceCache;
}

async function getImplantSlot(typeId) {
  if (implantSlotCache.has(typeId)) return implantSlotCache.get(typeId);
  if (implantSlotInFlight.has(typeId)) return implantSlotInFlight.get(typeId);

  const promise = (async () => {
    try {
      const data = await publicFetch(`/universe/types/${typeId}/`);
      const attr = Array.isArray(data.dogma_attributes)
        ? data.dogma_attributes.find((a) => a.attribute_id === 331)
        : null;
      const slot = attr ? Number(attr.value) : null;

      if (slot && slot >= 1 && slot <= 10) {
        implantSlotCache.set(typeId, slot);
        saveImplantSlotCache();
        return slot;
      }

      return null;
    } catch {
      return null;
    } finally {
      implantSlotInFlight.delete(typeId);
    }
  })();

  implantSlotInFlight.set(typeId, promise);
  return promise;
}

function inferActiveClone(current, previous) {
  if (!current) return { status: 'unknown' };
  if (!previous) return { status: 'first_run', current };

  const currIds = new Set(current.jump_clones.map((jc) => jc.jump_clone_id));

  const vanished = previous.jump_clones.filter((jc) => !currIds.has(jc.jump_clone_id));
  const jumpDateChanged = current.last_clone_jump_date !== previous.last_clone_jump_date;

  if (vanished.length === 1 && jumpDateChanged) {
    return { status: 'occupied', clone: vanished[0], confidence: 'high' };
  }

  if (vanished.length >= 2 && jumpDateChanged) {
    return { status: 'occupied', clone: vanished[0], confidence: 'uncertain', allVanished: vanished };
  }

  if (vanished.length >= 1 && !jumpDateChanged) {
    return { status: 'relocated' };
  }

  return { status: 'no_change' };
}

module.exports = {
  getClones,
  getMarketPrices,
  getImplantSlot,
  inferActiveClone,
  loadImplantSlotCache
};

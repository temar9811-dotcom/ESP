// File: main/assets-names-helpers.js | Version: 1.0
'use strict';
const accounts = require('./accounts');
const { publicFetch, esiPost } = require('../eve/http');
const logger = require('./debug-logger');

function makeTypeLookup() {
  const map = new Map();
  return async function typeOf(typeId) {
    const id = Number(typeId);
    if (!Number.isFinite(id)) return null;
    if (map.has(id)) return map.get(id);
    let info = null;
    try {
      await accounts.waitErrorBudget();
      const t = await publicFetch(`/universe/types/${id}/`);
      info = { categoryId: t && t.category_id != null ? Number(t.category_id) : null, groupId: t && t.group_id != null ? Number(t.group_id) : null, name: t && t.name ? String(t.name) : null };
    } catch { info = null; }
    map.set(id, info);
    return info;
  };
}

const CONTAINER_GROUPS = new Set([12, 90, 155, 1145]);

function classifyFlag(flag) {
  const f = String(flag || '');
  if (f === '89') return { kind: 'implant', label: 'Plugged-in implant' };
  if (f === 'JumpClone') return { kind: 'clone', label: 'Jump clone' };
  if (f === 'ActiveClone') return { kind: 'clone', label: 'Active clone' };
  if (f === 'MarketOrderSell') return { kind: 'market-order', label: 'Market sell order' };
  if (f === 'MarketOrderBuy') return { kind: 'market-order', label: 'Market buy order' };
  if (f === 'ContractIncluded') return { kind: 'contract', label: 'Contract item' };
  if (f === 'ContractExcluded') return { kind: 'contract', label: 'Contract item (excluded)' };
  if (f === 'Manufacturing') return { kind: 'industry', label: 'Manufacturing job' };
  if (f === 'Reactions') return { kind: 'industry', label: 'Reaction job' };
  if (f === 'Copying') return { kind: 'industry', label: 'Copying job' };
  return null;
}

function classifyContainerItem(typeInfo) {
  if (!typeInfo) return 'unknown';
  if (typeInfo.categoryId === 6) return 'ship';
  if (typeInfo.groupId != null && CONTAINER_GROUPS.has(typeInfo.groupId)) return 'container';
  if (typeInfo.categoryId === 65 || typeInfo.categoryId === 23) return 'structure';
  if (typeInfo.categoryId === 3) return 'station';
  if (typeInfo.categoryId === 2) return 'container';
  return 'unknown';
}

async function fetchItemNames(characterId, ids, token) {
  const out = new Map();
  const want = [...new Set(ids.map(Number).filter(Number.isFinite))];
  if (!want.length) return out;
  const chunkSize = 1000;
  for (let i = 0; i < want.length; i += chunkSize) {
    const chunk = want.slice(i, i + chunkSize);
    try {
      await accounts.waitErrorBudget();
      const arr = await esiPost(`/characters/${characterId}/assets/names/`, chunk, token);
      for (const hit of arr || []) {
        if (hit && hit.item_id != null && hit.name) out.set(Number(hit.item_id), String(hit.name));
      }
    } catch (err) {
      if (err && (err.status === 420 || err.status === 429)) throw err;
      logger.warn('ASSETS-NAMES', `fetchItemNames chunk failed`, { offset: i, error: err?.message });
    }
  }
  return out;
}

module.exports = { makeTypeLookup, classifyFlag, classifyContainerItem, fetchItemNames, CONTAINER_GROUPS };
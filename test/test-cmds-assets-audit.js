'use strict';

// Location classifier + structure cache audit commands.

module.exports = {
  'assets.locationClassify': async (payload) => {
    const accountsMod = require('../main/accounts');
    const assetsMod = require('../main/assets');
    const { publicFetch } = require('../eve/http');
    const { classifyLocationId, classifyTypeCategory } = require('../main/location-classifier');
    const list = accountsMod.getAccounts();
    const target =
      (payload && payload.id &&
        list.find((a) => Number(a.characterId) === Number(payload.id))) ||
      list[0] ||
      null;
    if (!target) return { ok: false, error: 'No characters added.' };
    const token = await accountsMod.getValidAccessToken(target, false);
    const raw = await assetsMod.getCharacterAssets(target.characterId, token);
    const byItemId = new Map(raw.map((a) => [a.item_id, a]));
    const seen = new Set();
    const counts = {};
    const examples = {};
    const catCache = new Map();
    const categoryOf = async (typeId) => {
      if (catCache.has(typeId)) return catCache.get(typeId);
      let cat = null;
      try {
        const t = await publicFetch(`/universe/types/${typeId}/`);
        cat = t && t.category_id != null ? Number(t.category_id) : null;
      } catch {
        cat = null;
      }
      catCache.set(typeId, cat);
      return cat;
    };
    const bump = (kind, id) => {
      counts[kind] = (counts[kind] || 0) + 1;
      if (!examples[kind]) examples[kind] = id;
    };
    for (const asset of raw) {
      if (seen.has(asset.location_id)) continue;
      seen.add(asset.location_id);
      const piContext = (asset.location_flag || '').toLowerCase() === 'autofit';
      const broad = classifyLocationId(asset.location_id, asset.location_type, {
        piContext
      });
      if (broad !== 'item') {
        bump(broad, asset.location_id);
        continue;
      }
      const container = byItemId.get(asset.location_id);
      if (container && container.type_id != null) {
        const cat = await categoryOf(container.type_id);
        bump(cat != null ? classifyTypeCategory(cat) : 'item', asset.location_id);
      } else {
        bump('item (unresolved)', asset.location_id);
      }
    }
    return {
      ok: true,
      result: {
        characterId: target.characterId,
        total: raw.length,
        uniqueLocations: seen.size,
        counts,
        examples
      }
    };
  },

  'assets.structureAudit': async (payload) => {
    const queue = require('../main/assets-queue');
    const accountsMod = require('../main/accounts');
    const assetsMod = require('../main/assets');
    const list = accountsMod.getAccounts();
    const target =
      (payload && payload.id &&
        list.find((a) => Number(a.characterId) === Number(payload.id))) ||
      list[0] ||
      null;
    if (!target) return { ok: false, error: 'No characters added.' };
    accountsMod.ensureScopes(target);
    const scopeList = typeof target.scopes === 'string'
      ? target.scopes.split(' ').filter(Boolean)
      : Array.isArray(target.scopes) ? target.scopes : null;
    const canReadStructures =
      scopeList == null || scopeList.includes('esi-universe.read_structures.v1');
    const disk = assetsMod.getStructureDiskCache();
    const markers = Object.entries(disk)
      .filter(
        ([, entry]) =>
          (entry.name || '').startsWith('Structure ') ||
          entry.failedAt != null ||
          entry.failedUntil != null
      )
      .map(([id, entry]) => ({
        id: Number(id),
        name: entry.name || null,
        status: entry.status || null,
        systemId: entry.systemId != null ? Number(entry.systemId) : null,
        savedAt: entry.savedAt || null,
        failedAt: entry.failedAt || null,
        failedUntil: entry.failedUntil || null
      }));
    let probe = null;
    let probeAll = null;
    if (markers.length) {
      try {
        const token = await accountsMod.getValidAccessToken(target, false);
        await accountsMod.waitRateLimit();
        probe = await assetsMod.probeStructure(markers[0].id, token);
        probe.id = markers[0].id;
      } catch (err) {
        probe = { ok: false, error: String((err && err.message) || err) };
      }
      if (payload && payload.probeAll) {
        probeAll = [];
        try {
          const token = await accountsMod.getValidAccessToken(target, false);
          for (const marker of markers) {
            await accountsMod.waitRateLimit();
            const result = await assetsMod.probeStructure(marker.id, token);
            probeAll.push({ id: marker.id, ...result });
          }
        } catch (err) {
          probeAll.push({ error: String((err && err.message) || err) });
        }
      }
    }
    const queueRunning = queue.isRunning
      ? queue.isRunning()
      : queue.getState
        ? queue.getState().running
        : null;
    return {
      ok: true,
      result: {
        character: target.characterName,
        canReadStructures,
        scopes: scopeList,
        markers,
        probe,
        probeAll,
        queueRunning
      }
    };
  }
};
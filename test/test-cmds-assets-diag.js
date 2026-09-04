'use strict';

// Asset name-resolution diagnostic: scopes, resolved kinds, orphan walk.

module.exports = {
  'assets.namesDiag': async () => {
    const accountsMod = require('../main/accounts');
    const assetsNamesMod = require('../main/assets-names');
    const assetsSyncMod = require('../main/assets-sync');
    const assetsMod = require('../main/assets');
    const list = accountsMod.getAccounts();
    const out = [];
    for (const target of list) {
      accountsMod.ensureScopes(target);
      const scopeList = typeof target.scopes === 'string'
        ? target.scopes.split(' ').filter(Boolean)
        : Array.isArray(target.scopes) ? target.scopes : null;
      const canReadStructures =
        scopeList == null ||
        scopeList.includes('esi-universe.read_structures.v1');
      const names = assetsNamesMod.getNames(target.characterId);
      const kinds = {};
      if (names && names.locations) {
        for (const info of Object.values(names.locations)) {
          const k = (info && info.kind) || 'unknown';
          kinds[k] = (kinds[k] || 0) + 1;
        }
      }
      const raw = assetsSyncMod.getRaw(target.characterId);
      let rawCount = 0;
      let orphanCount = 0;
      let itemTopCount = 0;
      const topLocTypes = {};
      let maxItemId = 0;
      let maxLocationId = 0;
      let corpByItemId = null;
      let corpRawCount = 0;
      try {
        const corpId = target.corporationId || null;
        if (corpId) {
          const corpRaw = assetsSyncMod.getCorpRaw(corpId);
          if (corpRaw && Array.isArray(corpRaw.assets) && corpRaw.assets.length) {
            corpByItemId = assetsMod.buildCorpMap(corpRaw.assets);
            corpRawCount = corpRaw.assets.length;
          }
        }
      } catch {
        corpByItemId = null;
      }
      let missingParentCount = 0;
      let missingButPresent = 0;
      let corpCoveredParents = 0;
      let corpOrphanCount = null;
      let missingParentInfo = [];
      let orphanSamples = [];
      if (raw && Array.isArray(raw.assets)) {
        rawCount = raw.assets.length;
        const byItemId = new Map(raw.assets.map((a) => [Number(a.item_id), a]));
        for (const a of raw.assets) {
          if (typeof a.item_id === 'number' && a.item_id > maxItemId) maxItemId = a.item_id;
          if (typeof a.location_id === 'number' && a.location_id > maxLocationId) maxLocationId = a.location_id;
        }
        const seenTops = new Set();
        const missingParents = new Set();
        for (const asset of raw.assets) {
          const { top, missingParentId } = assetsMod.walkToTop(asset, byItemId);
          if (!top) {
            orphanCount++;
            if (missingParentId != null) missingParents.add(Number(missingParentId));
            continue;
          }
          if (seenTops.has(top.item_id)) continue;
          seenTops.add(top.item_id);
          const t = top.location_type || 'unknown';
          topLocTypes[t] = (topLocTypes[t] || 0) + 1;
          if (t === 'item') itemTopCount++;
        }
        for (const pid of missingParents) {
          if (byItemId.has(pid)) missingButPresent++;
        }
        missingParentCount = missingParents.size;
        if (corpByItemId) {
          corpOrphanCount = 0;
          for (const pid of missingParents) {
            if (corpByItemId.has(pid)) corpCoveredParents++;
          }
          for (const asset of raw.assets) {
            const r = assetsMod.walkToTop(asset, byItemId, corpByItemId);
            if (!r.top) corpOrphanCount++;
          }
        }
        const resolvedLocs = names && names.locations ? names.locations : null;
        if (missingParents.size) {
          try {
            await assetsMod.batchResolveNames([...missingParents]);
          } catch {
            // best effort
          }
          for (const pid of missingParents) {
            const hit = assetsMod.getCachedName ? assetsMod.getCachedName(pid) : null;
            const resolved = resolvedLocs ? resolvedLocs[pid] : null;
            missingParentInfo.push({
              id: pid,
              category: hit && hit.category ? hit.category : null,
              name: hit && hit.name ? hit.name : null,
              resolvedKind: resolved && resolved.kind ? resolved.kind : null,
              resolvedName: resolved && resolved.name ? resolved.name : null
            });
          }
        }
        const seenParents = new Set();
        for (const asset of raw.assets) {
          if (orphanSamples.length >= 8) break;
          const { top, missingParentId } = assetsMod.walkToTop(asset, byItemId);
          if (top || missingParentId == null) continue;
          const pid = Number(missingParentId);
          if (seenParents.has(pid)) continue;
          seenParents.add(pid);
          const corpRow = corpByItemId ? corpByItemId.get(pid) || null : null;
          orphanSamples.push({
            item_id: asset.item_id,
            type_id: asset.type_id,
            location_id: asset.location_id,
            location_type: asset.location_type,
            location_flag: asset.location_flag,
            is_singleton: asset.is_singleton,
            missingParentId: pid,
            corpParent: corpRow
              ? {
                  location_id: corpRow.location_id,
                  location_type: corpRow.location_type,
                  location_flag: corpRow.location_flag,
                  type_id: corpRow.type_id
                }
              : null
          });
        }
      }
      out.push({
        character: target.characterName,
        characterId: target.characterId,
        canReadStructures,
        scopes: scopeList,
        resolved: names ? Object.keys(names.locations).length : 0,
        fetchedAt: names ? names.fetchedAt : null,
        kinds,
        rawCount,
        orphanCount,
        itemTopCount,
        topLocTypes,
        maxItemId,
        maxItemIdSafe: Number.isSafeInteger(maxItemId),
        maxLocationId,
        maxLocationIdSafe: Number.isSafeInteger(maxLocationId),
        missingParentCount,
        missingButPresent,
        corpRawCount,
        corpCoveredParents,
        corpOrphanCount,
        missingParentInfo,
        orphanSamples
      });
    }
    return { ok: true, result: out };
  }
};
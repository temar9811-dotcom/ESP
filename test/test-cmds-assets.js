'use strict';

// Asset pipeline test commands: debug dumps, tree build, cache controls.

module.exports = {
  'assets.debug': async () => {
    const accountsMod = require('../main/accounts');
    const assetsMod = require('../main/assets');
    const { publicFetch, esiFetch } = require('../eve/http');
    const target = accountsMod.getAccounts()[0];
    if (!target) return { ok: false, error: 'No characters added.' };
    const token = await accountsMod.getValidAccessToken(target, false);
    const raw = await assetsMod.getCharacterAssets(target.characterId, token);
    const typeCounts = {};
    const onePerType = {};
    for (const a of raw) {
      typeCounts[a.location_type] = (typeCounts[a.location_type] || 0) + 1;
      if (!onePerType[a.location_type]) onePerType[a.location_type] = a;
    }
    const sysSample = raw.find((a) => a.location_type === 'solar_system');
    const stSample = raw.find((a) => a.location_type === 'station');
    const strSample = raw.find((a) => a.location_type === 'structure');
    let systemRaw = null;
    let regionRaw = null;
    if (sysSample) {
      try {
        systemRaw = await publicFetch(`/universe/systems/${sysSample.location_id}/`);
      } catch (e) {
        systemRaw = { error: e?.status ?? '', message: e?.message || String(e) };
      }
      if (systemRaw && systemRaw.region_id != null) {
        try {
          regionRaw = await publicFetch(`/universe/regions/${systemRaw.region_id}/`);
        } catch (e) {
          regionRaw = { error: e?.status ?? '', message: e?.message || String(e) };
        }
      }
    }
    let stationRaw = null;
    if (stSample) {
      try {
        stationRaw = await publicFetch(`/universe/stations/${stSample.location_id}/`);
      } catch (e) {
        stationRaw = { error: e?.status ?? '', message: e?.message || String(e) };
      }
    }
    let structureRaw = null;
    if (strSample) {
      try {
        structureRaw = await esiFetch(`/universe/structures/${strSample.location_id}/`, token);
      } catch (e) {
        structureRaw = { error: e?.status ?? '', message: e?.message || String(e) };
      }
    }
    return {
      ok: true,
      result: {
        character: target.characterName,
        totalAssets: raw.length,
        typeCounts,
        onePerType,
        sysSampleId: sysSample ? sysSample.location_id : null,
        systemRaw,
        regionRaw,
        stationRaw,
        structureRaw
      }
    };
  },

  'assets.debug2': async () => {
    const accountsMod = require('../main/accounts');
    const assetsMod = require('../main/assets');
    const { publicFetch } = require('../eve/http');
    const target = accountsMod.getAccounts()[0];
    if (!target) return { ok: false, error: 'No characters added.' };
    const token = await accountsMod.getValidAccessToken(target, false);
    const raw = await assetsMod.getCharacterAssets(target.characterId, token);
    const stSample = raw.find((a) => a.location_type === 'station');
    let stationRaw = null;
    let systemRaw = null;
    let regionRaw = null;
    if (stSample) {
      try {
        stationRaw = await publicFetch(`/universe/stations/${stSample.location_id}/`);
      } catch (e) {
        stationRaw = { error: e?.message || String(e) };
      }
      if (stationRaw && stationRaw.system_id != null) {
        try {
          systemRaw = await publicFetch(`/universe/systems/${stationRaw.system_id}/`);
        } catch (e) {
          systemRaw = { error: e?.message || String(e) };
        }
        if (systemRaw && systemRaw.region_id != null) {
          try {
            regionRaw = await publicFetch(`/universe/regions/${systemRaw.region_id}/`);
          } catch (e) {
            regionRaw = { error: e?.message || String(e) };
          }
        }
      }
    }
    const tree = await assetsMod.buildAssetTree(raw, token);
    return {
      ok: true,
      result: {
        stationId: stSample ? stSample.location_id : null,
        systemRaw,
        regionRaw,
        treeRegionKeys: Object.keys(tree.regions),
        treeSystemsByRegion: Object.entries(tree.regions).map(
          ([name, region]) => ({ region: name, systems: Object.keys(region.systems) })
        )
      }
    };
  },

  'assets.clearStructureFailures': async () => {
    const assetsMod = require('../main/assets');
    const removed = assetsMod.clearStructureFailures();
    return { ok: true, result: { removed } };
  },

  'assets.resolveNames': async () => {
    const assetsNamesMod = require('../main/assets-names');
    const result = await assetsNamesMod.pull();
    return { ok: true, result };
  },

  'assets.pullRaw': async () => {
    const assetsSyncMod = require('../main/assets-sync');
    const result = await assetsSyncMod.pull();
    return { ok: true, result };
  }
};
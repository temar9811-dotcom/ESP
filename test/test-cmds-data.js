'use strict';

// Read-only data probes: skill meta, wallet details, corp info.

module.exports = {
  'skills.meta': async () => {
    const skillMeta = require('../main/skill-meta');
    const accountsMod = require('../main/accounts');
    const withQueue = accountsMod
      .getAccounts()
      .find((a) => Array.isArray(a.queue) && a.queue.length);
    const ids = withQueue
      ? withQueue.queue.slice(0, 3).map((q) => q.skill_id).filter(Boolean)
      : [3412];
    const meta = await skillMeta.getMetaForIds(ids);
    const ranks = ids.map((id) => ({
      id,
      rank: meta && meta[id] ? meta[id].rank : null
    }));
    return { ok: ranks.every((r) => r.rank != null), result: ranks };
  },

  'wallet.details': async () => {
    const accountsMod = require('../main/accounts');
    const eve = require('../eve');
    const first = accountsMod.getAccounts()[0];
    if (!first) {
      return { ok: false, error: 'No characters added.' };
    }
    const token = await accountsMod.getValidAccessToken(first, false);
    const details = await eve.getWalletDetails(first.characterId, token, 7);
    return {
      ok: true,
      result: {
        character: first.characterName,
        keys: Object.keys(details || {})
      }
    };
  },

  'corp.info': async () => {
    const corpInfo = require('../main/corp-info');
    const accountsMod = require('../main/accounts');
    const first = accountsMod.getAccounts()[0];
    if (!first) {
      return { ok: false, error: 'No characters added.' };
    }
    const info = await corpInfo.getCorpAlliance(first.characterId);
    return { ok: true, result: info };
  }
};
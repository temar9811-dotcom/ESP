'use strict';

const ESI_BASE = 'https://esi.evetech.net/latest';

const cache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000;

async function esiGet(path) {
  const res = await fetch(`${ESI_BASE}${path}?datasource=tranquility`, {
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`ESI ${res.status}`);
  }

  return res.json();
}

async function getCorpAlliance(characterId) {
  const id = Number(characterId);

  const cached = cache.get(id);

  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  const value = { corporation: null, alliance: null };

  try {
    const character = await esiGet(`/characters/${id}/`);

    if (character && character.corporation_id) {
      try {
        const corp = await esiGet(`/corporations/${character.corporation_id}/`);
        value.corporation = (corp && corp.name) || null;
      } catch {
        // Ignore corp lookup failures.
      }
    }

    if (character && character.alliance_id) {
      try {
        const alliance = await esiGet(`/alliances/${character.alliance_id}/`);
        value.alliance = (alliance && alliance.name) || null;
      } catch {
        // Ignore alliance lookup failures.
      }
    }
  } catch {
    // Ignore character lookup failures.
  }

  cache.set(id, { value, fetchedAt: Date.now() });
  return value;
}

module.exports = {
  getCorpAlliance
};
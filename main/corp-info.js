'use strict';

const ESI_BASE = 'https://esi.evetech.net/latest';
const logger = require('./debug/logger');

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
    logger.debug('CORP-INFO', `Cache hit for character ${id}`);
    return cached.value;
  }

  const value = { corporation: null, alliance: null };

  try {
    const character = await esiGet(`/characters/${id}/`);

    if (character && character.corporation_id) {
      try {
        const corp = await esiGet(`/corporations/${character.corporation_id}/`);
        value.corporation = (corp && corp.name) || null;
      } catch (err) {
        logger.warn('CORP-INFO', `Corp lookup failed for ${id}`, { error: err.message });
      }
    }

    if (character && character.alliance_id) {
      try {
        const alliance = await esiGet(`/alliances/${character.alliance_id}/`);
        value.alliance = (alliance && alliance.name) || null;
      } catch (err) {
        logger.warn('CORP-INFO', `Alliance lookup failed for ${id}`, { error: err.message });
      }
    }
  } catch (err) {
    logger.warn('CORP-INFO', `Character lookup failed for ${id}`, { error: err.message });
  }

  cache.set(id, { value, fetchedAt: Date.now() });
  logger.debug('CORP-INFO', `Fetched corp/alliance for ${id}`, value);
  return value;
}

module.exports = {
  getCorpAlliance
};
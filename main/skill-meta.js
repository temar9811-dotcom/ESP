'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const DOGMA_RANK_ATTRIBUTE = 275;

let cache = null;

function cacheFile() {
  return path.join(app.getPath('userData'), 'skill-meta.json');
}

function loadCache() {
  if (cache) return cache;

  try {
    cache = JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) || {};
  } catch {
    cache = {};
  }

  return cache;
}

function saveCache() {
  try {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify(cache || {}, null, 2),
      'utf8'
    );
  } catch {
    // Ignore cache write errors.
  }
}

async function fetchRankForId(skillId) {
  const url = `https://esi.evetech.net/latest/universe/types/${skillId}/?datasource=tranquility`;

  const res = await fetch(url, { headers: { Accept: 'application/json' } });

  if (!res.ok) return null;

  const type = await res.json();
  const attrs = Array.isArray(type.dogma_attributes)
    ? type.dogma_attributes
    : [];
  const rankAttr = attrs.find(
    (attribute) => attribute.attribute_id === DOGMA_RANK_ATTRIBUTE
  );

  return rankAttr ? Number(rankAttr.value) : 1;
}

async function getMetaForIds(ids) {
  loadCache();

  const out = {};
  const missing = [];

  for (const id of ids || []) {
    const key = String(id);

    if (cache[key] != null) {
      out[id] = { rank: cache[key] };
    } else {
      missing.push([key, id]);
    }
  }

  if (missing.length) {
    const fetched = await Promise.all(
      missing.map(async ([key, originalId]) => {
        try {
          const rank = await fetchRankForId(key);
          return [key, originalId, rank];
        } catch {
          return [key, originalId, null];
        }
      })
    );

    let changed = false;

    for (const [key, originalId, rank] of fetched) {
      if (rank != null) {
        cache[key] = rank;
        out[originalId] = { rank };
        changed = true;
      }
    }

    if (changed) saveCache();
  }

  return out;
}

module.exports = {
  getMetaForIds
};
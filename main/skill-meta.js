'use strict';

const { app } = require('electron');
const path = require('path');
const fs = require('fs');

const ESI_URL =
  'https://esi.evetech.net/latest/universe/skills/?datasource=tranquility&language=en-us';

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

let cache = null;

function cacheFile() {
  return path.join(app.getPath('userData'), 'skill-meta.json');
}

function loadCache() {
  if (cache) return cache;

  try {
    const raw = JSON.parse(fs.readFileSync(cacheFile(), 'utf8'));

    if (
      raw &&
      raw.fetchedAt &&
      Date.now() - raw.fetchedAt < CACHE_TTL_MS &&
      raw.byId
    ) {
      cache = raw.byId;
      return cache;
    }
  } catch {
    // Fall through to a fresh fetch.
  }

  return null;
}

async function ensureMeta() {
  const cached = loadCache();

  if (cached) return cached;

  const res = await fetch(ESI_URL, {
    headers: { Accept: 'application/json' }
  });

  if (!res.ok) {
    throw new Error(`ESI ${res.status}`);
  }

  const list = await res.json();
  const byId = {};

  for (const skill of list || []) {
    if (skill && skill.id != null) {
      byId[String(skill.id)] = Number(skill.rank || 1);
    }
  }

  cache = byId;

  try {
    fs.mkdirSync(path.dirname(cacheFile()), { recursive: true });
    fs.writeFileSync(
      cacheFile(),
      JSON.stringify({ fetchedAt: Date.now(), byId }, null, 2),
      'utf8'
    );
  } catch {
    // Ignore cache write errors.
  }

  return byId;
}

async function getMetaForIds(ids) {
  const byId = await ensureMeta();
  const out = {};

  for (const id of ids || []) {
    const rank = byId[String(id)];

    if (rank != null) {
      out[id] = { rank };
    }
  }

  return out;
}

module.exports = {
  getMetaForIds
};
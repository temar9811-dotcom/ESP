// eve/notification-ids.js
// VERSION: 1.0
// EVE notification texts arrive from ESI as JSON-ish template strings:
//   {"charID":2113716316,"itemTypeID":21848,...}
// This module extracts the "key":value pairs, classifies each key by the
// kind of entity its ID refers to, and can annotate the text with resolved
// names so notifications are readable instead of full of raw IDs.
'use strict';

// Curated map of ESI notification template keys -> entity kind. Keys not in
// this map but ending in ID/Id are still extracted for reporting, tagged
// "unknown"; they are never queued to ESI on their own.
const KEY_KINDS = {
  // characters
  charID: 'character',
  charId: 'character',
  CharacterID: 'character',
  characterID: 'character',
  victimID: 'character',
  victimCharID: 'character',
  attackerID: 'character',
  aggressorID: 'character',
  defenderID: 'character',
  declaredByID: 'character',
  againstID: 'character',
  executorID: 'character',
  assigneeID: 'character',
  targetID: 'character',
  // corporations
  corporationID: 'corporation',
  corpID: 'corporation',
  ownerCorporationID: 'corporation',
  oldCorpID: 'corporation',
  newCorpID: 'corporation',
  aggressorCorpID: 'corporation',
  defenderCorpID: 'corporation',
  executorCorpID: 'corporation',
  victimCorpID: 'corporation',
  // alliances
  allianceID: 'alliance',
  executorAllianceID: 'alliance',
  aggressorAllianceID: 'alliance',
  defenderAllianceID: 'alliance',
  victimAllianceID: 'alliance',
  // factions
  factionID: 'faction',
  victimFactionID: 'faction',
  // inventory types
  typeID: 'type',
  itemTypeID: 'type',
  structureTypeID: 'type',
  shipTypeID: 'type',
  weaponTypeID: 'type',
  targetTypeID: 'type',
  // solar systems
  solarSystemID: 'system',
  systemID: 'system',
  sovSystemID: 'system',
  vulnerabilitySystemID: 'system',
  // stations / structures
  stationID: 'station',
  homeStationID: 'station',
  structureID: 'structure',
  citadelID: 'structure',
  vulnerableStructureID: 'structure',
  // constellations / regions
  constellationID: 'constellation',
  regionID: 'region',
  // celestial bodies (SDE-only, never ESI)
  planetID: 'planet',
  moonID: 'moon',
  // unique instances / events (never ESI-resolvable)
  itemID: 'item',
  containerID: 'item',
  warID: 'war',
  killID: 'kill'
};

// Kinds the ESI /universe/names endpoint can resolve.
const ESI_RESOLVABLE = new Set([
  'character', 'corporation', 'alliance', 'faction', 'type',
  'system', 'station', 'structure', 'constellation', 'region'
]);

const ID_PAIR_RE = /"([A-Za-z][A-Za-z0-9_]*)":\s*(-?\d+)/g;

function kindOf(key) {
  if (KEY_KINDS[key]) return KEY_KINDS[key];
  return /ID$/i.test(key) ? 'unknown' : null;
}

// Pull every "key":value pair out of an ESI notification text. Returns
// [{ key, kind, id }] for pairs whose value is a positive integer ID.
function extractIds(text) {
  const out = [];
  if (!text || typeof text !== 'string') return out;
  const re = new RegExp(ID_PAIR_RE.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const key = m[1];
    const kind = kindOf(key);
    if (!kind) continue;
    const id = Number(m[2]);
    if (!Number.isFinite(id) || id <= 0) continue;
    out.push({ key, kind, id });
  }
  return out;
}

// Module-level cache of SDE lookups so snapshot builds don't hit sql.js for
// the same IDs repeatedly. SDE data is static; the live universe-names cache
// is consulted first, so late ESI resolutions still win.
const sdeNameCache = new Map();
function cacheSde(id, name) {
  if (sdeNameCache.size > 20000) sdeNameCache.clear();
  sdeNameCache.set(id, name || null);
  return name;
}

// Builds an id -> name resolver that checks the live universe-names cache
// first, then the SDE via the provided lookup functions (each a fn(id)->name
// or null/undefined). Unresolvable IDs resolve to null and get cached as such.
function createLocalResolver(options) {
  const names = (options && options.names) || {};
  const lookups = [
    options && options.getTypeName,
    options && options.getSystemName,
    options && options.getStationName,
    options && options.getConstellationName,
    options && options.getRegionName,
    options && options.getFactionName,
    options && options.getPlanetName
  ].filter(Boolean);

  return (id) => {
    if (names[id]) return names[id];
    if (sdeNameCache.has(id)) return sdeNameCache.get(id);
    for (const lookup of lookups) {
      let name = null;
      try { name = lookup(id); } catch { name = null; }
      if (name) return cacheSde(id, name);
    }
    return cacheSde(id, null);
  };
}

// Annotate a notification text: extract all ID pairs, resolve the ones we can
// locally, and build a version of the text with names substituted in place of
// raw IDs. Returns { ids: [{key, kind, id, name, resolved}], resolvedText }.
function annotate(text, nameForId) {
  const ids = extractIds(text).map((e) => {
    const name = nameForId ? nameForId(e.id) : null;
    return { ...e, name: name || null, resolved: Boolean(name) };
  });

  let resolvedText = text || '';
  const byKey = new Map();
  for (const e of ids) {
    if (e.resolved && !byKey.has(e.key)) byKey.set(e.key, e.name);
  }
  if (byKey.size > 0) {
    resolvedText = resolvedText.replace(
      /"([A-Za-z][A-Za-z0-9_]*)":\s*(-?\d+)/g,
      (full, key, rawVal) => {
        const name = byKey.get(key);
        return name == null ? full : `"${key}":${name}`;
      }
    );
  }
  return { ids, resolvedText: resolvedText || text || '' };
}

module.exports = { KEY_KINDS, ESI_RESOLVABLE, kindOf, extractIds, annotate, createLocalResolver };
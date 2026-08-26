'use strict';

// --- ESI location classification (pure, no I/O) ---
//
// Classifies a location_id from an ESI pull into what it physically is:
// station, planet, solar system, or an "item" (ship / container / player
// structure). EVE IDs are issued in documented ranges, so the broad class
// is decidable offline:
//
//   30,000,000 - 30,999,999   solar systems
//   40,000,000 - 49,999,999   celestials (planets, moons, belts)
//   50,000,000 - 50,999,999   stargates
//   60,000,000 - 63,999,999   NPC stations (outposts included)
//   1,000,000,000,000+        items: ships, containers, player structures
//
// The item range is the ambiguous one — citadels, ships, and containers
// all live above 1e12, so separating them needs the item's type_id and
// its SDE category (see classifyTypeCategory).

const RANGES = {
  SOLAR_SYSTEM: [30000000, 30999999],
  CELESTIAL: [40000000, 49999999],
  STARGATE: [50000000, 50999999],
  STATION: [60000000, 63999999],
  ITEM_MIN: 1000000000000
};

// SDE category ids used to split the item range.
const CATEGORY = {
  CELESTIAL: 2, // includes containers (secure, audit-log, freight)
  STATION: 3,
  SHIP: 6,
  STARBASE: 23, // legacy POS towers
  STRUCTURE: 65 // citadels / engineering complexes / refineries
};

function inRange(id, [min, max]) {
  return id >= min && id <= max;
}

// Classify a raw location_id (+ optional ESI location_type hint) into:
//   'station' | 'planet' | 'celestial' | 'stargate' | 'solar_system'
//   | 'item' | 'unknown'
//
// 'item' means "inside a ship / container / player structure" — pass the
// containing item's type info to classifyTypeCategory() to split further.
// 'planet' is returned when the ESI hint marks it as PI (location_flag
// AutoFit / deliveries handled by the caller; here a `piContext` flag).
function classifyLocationId(locationId, locationType, opts = {}) {
  const id = Number(locationId);
  if (!Number.isFinite(id) || id <= 0) return 'unknown';

  // Trust the ESI hint first — it is authoritative for the broad class.
  if (locationType === 'station') return 'station';
  if (locationType === 'item') return 'item';

  if (locationType === 'solar_system') {
    if (opts.piContext) return 'planet';
    if (inRange(id, RANGES.CELESTIAL)) return 'celestial';
    return 'solar_system';
  }

  // 'structure' / 'other' both mean "id >= 1e12, split later".
  if (locationType === 'structure' || locationType === 'other') {
    return id >= RANGES.ITEM_MIN ? 'item' : 'unknown';
  }

  // No hint (or an unhelpful one): fall back to pure ranges.
  if (inRange(id, RANGES.STATION)) return 'station';
  if (inRange(id, RANGES.CELESTIAL)) {
    return opts.piContext ? 'planet' : 'celestial';
  }
  if (inRange(id, RANGES.STARGATE)) return 'stargate';
  if (inRange(id, RANGES.SOLAR_SYSTEM)) return 'solar_system';
  if (id >= RANGES.ITEM_MIN) return 'item';

  return 'unknown';
}

// Split the 'item' class using the containing item's SDE category (from
// its type_id via /universe/types/ or the bundled type cache). Returns:
//   'ship' | 'container' | 'structure' | 'station' | 'unknown'
function classifyTypeCategory(categoryId) {
  const cat = Number(categoryId);
  if (cat === CATEGORY.SHIP) return 'ship';
  if (cat === CATEGORY.CELESTIAL) return 'container';
  if (cat === CATEGORY.STRUCTURE || cat === CATEGORY.STARBASE) {
    return 'structure';
  }
  if (cat === CATEGORY.STATION) return 'station';
  return 'unknown';
}

// Full classification for an ESI asset row, given its top-of-chain
// location and (when the top is an item) the containing item's category.
// Returns one of: station | planet | celestial | stargate | solar_system
// | ship | container | structure | item | unknown.
function classifyAssetLocation(asset, containerCategoryId) {
  if (!asset) return 'unknown';

  const piContext = (asset.location_flag || '').toLowerCase() === 'autofit';
  const broad = classifyLocationId(asset.location_id, asset.location_type, {
    piContext
  });

  if (broad !== 'item') return broad;
  if (containerCategoryId == null) return 'item';
  return classifyTypeCategory(containerCategoryId);
}

module.exports = {
  RANGES,
  CATEGORY,
  classifyLocationId,
  classifyTypeCategory,
  classifyAssetLocation
};

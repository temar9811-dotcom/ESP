'use strict';

// Test: can we tell, from a structure/location pull off ESI, whether a
// location is a station, ship, planet, or container?
//
// Runs headless:  node test/location-classifier.test.js
// (The classifier is pure — ID ranges + SDE category, no ESI calls.)

const assert = require('assert');
const {
  classifyLocationId,
  classifyTypeCategory,
  classifyAssetLocation
} = require('../main/location-classifier');

// Representative IDs from real EVE ranges (Jita system / Jita 4-4).
const JITA_SYSTEM = 30000142;
const JITA_44_STATION = 60003760;
const JITA_PLANET = 40009088; // a celestial in Jita
const JITA_STARGATE = 50001248;
const CITADEL_ID = 1030000000000; // player structure (item range)
const SHIP_ID = 1040000000001; // active ship (item range)
const CONTAINER_ID = 1040000000002; // container (item range)

// --- Broad classification from ID range (+ ESI location_type hint) ---

// Stations: 60M-64M range, or an explicit 'station' hint.
assert.strictEqual(classifyLocationId(JITA_44_STATION), 'station');
assert.strictEqual(classifyLocationId(60000001), 'station');
assert.strictEqual(classifyLocationId(63999999), 'station');
assert.strictEqual(classifyLocationId(64000000), 'unknown'); // just outside
assert.strictEqual(classifyLocationId(CONTAINER_ID, 'station'), 'station'); // hint wins

// Planets / celestials: 40M-50M range; PI assets (AutoFit flag) mean the
// id points at the planet itself.
assert.strictEqual(classifyLocationId(JITA_PLANET), 'celestial');
assert.strictEqual(classifyLocationId(JITA_PLANET, null, { piContext: true }), 'planet');
assert.strictEqual(classifyLocationId(JITA_PLANET, 'solar_system', { piContext: true }), 'planet');
assert.strictEqual(classifyLocationId(JITA_PLANET, 'solar_system'), 'celestial');

// Stargates and solar systems have their own ranges.
assert.strictEqual(classifyLocationId(JITA_STARGATE), 'stargate');
assert.strictEqual(classifyLocationId(JITA_SYSTEM), 'solar_system');
assert.strictEqual(classifyLocationId(JITA_SYSTEM, 'solar_system'), 'solar_system');

// Ships, containers, and player structures all share the >= 1e12 item
// range — 'item' here means "split via type category below".
assert.strictEqual(classifyLocationId(CITADEL_ID), 'item');
assert.strictEqual(classifyLocationId(SHIP_ID), 'item');
assert.strictEqual(classifyLocationId(CONTAINER_ID), 'item');
assert.strictEqual(classifyLocationId(CITADEL_ID, 'structure'), 'item');
assert.strictEqual(classifyLocationId(CITADEL_ID, 'other'), 'item');
assert.strictEqual(classifyLocationId(SHIP_ID, 'item'), 'item');

// Nonsense / edge inputs never throw and never lie.
assert.strictEqual(classifyLocationId(null), 'unknown');
assert.strictEqual(classifyLocationId(0), 'unknown');
assert.strictEqual(classifyLocationId(-1), 'unknown');
assert.strictEqual(classifyLocationId('not-a-number'), 'unknown');
assert.strictEqual(classifyLocationId(60003760, 'structure'), 'unknown'); // hint/range mismatch

// --- Splitting the item range via SDE category (from the type_id) ---

assert.strictEqual(classifyTypeCategory(6), 'ship'); // Ship
assert.strictEqual(classifyTypeCategory(2), 'container'); // Celestial (secure/freight containers)
assert.strictEqual(classifyTypeCategory(65), 'structure'); // Structure (citadels)
assert.strictEqual(classifyTypeCategory(23), 'structure'); // Starbase (POS)
assert.strictEqual(classifyTypeCategory(3), 'station'); // Station
assert.strictEqual(classifyTypeCategory(999), 'unknown');
assert.strictEqual(classifyTypeCategory(null), 'unknown');

// --- Full asset-row classification ---

// Asset sitting in an NPC station hangar.
assert.strictEqual(
  classifyAssetLocation({
    location_id: JITA_44_STATION,
    location_type: 'station',
    location_flag: 'Hangar'
  }),
  'station'
);

// PI asset: location_type 'solar_system' + AutoFit points at the planet.
assert.strictEqual(
  classifyAssetLocation({
    location_id: JITA_PLANET,
    location_type: 'solar_system',
    location_flag: 'AutoFit'
  }),
  'planet'
);

// Item chained inside a ship (category 6) -> ship.
assert.strictEqual(
  classifyAssetLocation(
    { location_id: SHIP_ID, location_type: 'item', location_flag: 'CargoHold' },
    6
  ),
  'ship'
);

// Item inside a secure container (category 2) -> container.
assert.strictEqual(
  classifyAssetLocation(
    { location_id: CONTAINER_ID, location_type: 'item', location_flag: 'Hangar' },
    2
  ),
  'container'
);

// 'other' location that resolves to a citadel type (category 65) -> structure.
assert.strictEqual(
  classifyAssetLocation(
    { location_id: CITADEL_ID, location_type: 'other', location_flag: 'Hangar' },
    65
  ),
  'structure'
);

// Item range with no type info yet stays honestly ambiguous.
assert.strictEqual(
  classifyAssetLocation({ location_id: SHIP_ID, location_type: 'item' }),
  'item'
);

console.log('location-classifier: all tests passed');

// FILE: test-pilots.js
// VERSION: 1.1.16-beta
'use strict';
const accounts = require('../main/accounts');
const groups = require('../main/groups');

const TEST_GROUP_NAME = 'Test Pilots';
const PILOTS = Array.from({ length: 20 }, (_, i) => ({
  id: 90000000 + i,
  name: `Test Pilot ${i + 1}`
}));

async function addPilots(payload, ctx) {
  const added = [];
  for (const pilot of PILOTS) {
    const allAccounts = accounts.getAccounts();
    if (!allAccounts.find(a => Number(a.characterId) === pilot.id)) {
      accounts.addTestPilot(pilot.id, pilot.name);
      added.push(pilot.name);
      
      try { 
        groups.setGroup(pilot.id, TEST_GROUP_NAME); 
      } catch (err) {
        console.warn(`[test-pilots] Failed to set group for ${pilot.name}:`, err.message);
      }
    }
  }
  
  return { ok: true, result: `Added ${added.length} test pilots to '${TEST_GROUP_NAME}'` };
}

async function removePilots(payload, ctx) {
  accounts.removeTestPilots();
  return { ok: true, result: 'Removed all test pilots' };
}

module.exports = { 
  'testPilot.add': addPilots, 
  'testPilot.remove': removePilots 
};
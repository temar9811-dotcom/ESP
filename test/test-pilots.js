'use strict';

const TEST_GROUP_NAME = 'Test Pilots';
const PILOTS = Array.from({ length: 20 }, (_, i) => ({
  id: 90000000 + i,
  name: `Test Pilot ${i + 1}`
}));

async function addPilots(payload, ctx) {
  const api = ctx.api;
  if (!api || typeof api.addTestPilot !== 'function') {
    return { ok: false, error: 'addTestPilot not available on API' };
  }

  const added = [];
  for (const pilot of PILOTS) {
    const accounts = api.getAccounts ? api.getAccounts() : [];
    if (!accounts.find(a => Number(a.characterId) === pilot.id)) {
      api.addTestPilot(pilot.id, pilot.name);
      added.push(pilot.name);
      if (typeof api.setGroup === 'function') {
        try { await api.setGroup(pilot.id, TEST_GROUP_NAME); } catch {}
      }
    }
  }

  return { ok: true, result: `Added ${added.length} test pilots to '${TEST_GROUP_NAME}'` };
}

async function removePilots(payload, ctx) {
  const api = ctx.api;
  if (!api || typeof api.removeTestPilots !== 'function') {
    return { ok: false, error: 'removeTestPilots not available on API' };
  }

  api.removeTestPilots();
  return { ok: true, result: 'Removed all test pilots' };
}

module.exports = { addPilots, removePilots };
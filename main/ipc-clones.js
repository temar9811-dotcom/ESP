// File Version: 1.1.15-beta
'use strict';
const { ipcMain } = require('electron');
const eve = require('../eve');
const accounts = require('./accounts');
const clonesHistory = require('./clones-history');
const cloneNicknames = require('./clones-nicknames');

function withTimeout(promise, ms) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`Timeout after ${ms}ms`)), ms); })
  ]).finally(() => clearTimeout(timer));
}

async function inferFirstRunActiveClone(characterId, token, jumpClones, clonesData) {
  let currentLocationId = null;
  try {
    const location = await eve.esiFetch(`/characters/${characterId}/location/`, token);
    currentLocationId = location?.solar_system_id || location?.station_id || null;
  } catch {
    return { jumpCloneId: null, name: 'Unknown', implants: [], totalValue: 0, confidence: 'unknown' };
  }
  if (!currentLocationId) {
    return { jumpCloneId: null, name: 'In space — active clone unknown', implants: [], totalValue: 0, confidence: 'unknown' };
  }
  const homeLocationId = clonesData.home_location?.location_id || null;
  const standbysAtLocation = jumpClones.filter((jc) => jc.locationId === currentLocationId);
  if (standbysAtLocation.length === 0) {
    if (homeLocationId && currentLocationId === homeLocationId) {
      return { jumpCloneId: null, name: 'Home clone', implants: [], totalValue: 0, confidence: 'likely' };
    }
    return { jumpCloneId: null, name: 'Occupying clone at this location', implants: [], totalValue: 0, confidence: 'likely' };
  }
  return { jumpCloneId: null, name: 'Active body at this location', implants: [], totalValue: 0, confidence: 'likely' };
}

async function fetchCloneDetails(account, token) {
  const id = account.characterId;
  const scopes = typeof account.scopes === 'string' ? account.scopes.split(' ') : Array.isArray(account.scopes) ? account.scopes : null;
  if (scopes !== null) {
    const hasClonesScope = scopes.includes('esi-clones.read_clones.v1');
    if (!hasClonesScope) {
      return { homeLocation: null, jumpClones: [], lastCloneJumpDate: null, activeClone: null, fetchedAt: new Date().toISOString() };
    }
  }
  let clonesData;
  try { clonesData = await withTimeout(eve.getClones(id, token), 10000); }
  catch (err) {
    if (err && err.status === 403) { account.scopes = ''; return { homeLocation: null, jumpClones: [], lastCloneJumpDate: null, activeClone: null, fetchedAt: new Date().toISOString() }; }
    throw err;
  }
  const previousSnapshot = clonesHistory.getSnapshot(id);
  const detection = eve.inferActiveClone(clonesData, previousSnapshot);
  clonesHistory.setSnapshot(id, clonesData);
  const priceMap = await withTimeout(eve.getMarketPrices(), 15000);
  const locationIds = (clonesData.jump_clones || []).map((jc) => jc.location_id);
  if (clonesData.home_location && clonesData.home_location.location_id) locationIds.push(clonesData.home_location.location_id);
  const locationNames = new Map();
  for (const locId of locationIds) {
    try {
      const name = await withTimeout(eve.resolveLocationName({ structure_id: locId, station_id: locId }, token), 10000);
      if (name) locationNames.set(locId, name);
    } catch { /* skip */ }
  }
  const allImplantTypeIds = new Set();
  for (const jc of clonesData.jump_clones || []) { for (const tid of jc.implants || []) allImplantTypeIds.add(tid); }
  let implantNames = new Map();
  if (allImplantTypeIds.size > 0) { try { implantNames = await withTimeout(eve.getTypeNames([...allImplantTypeIds]), 10000); } catch { /* ignore */ } }
  const nicknames = cloneNicknames.getAllNicknames();
  const jumpClones = [];
  for (const jc of clonesData.jump_clones || []) {
    const implants = []; let totalValue = 0;
    for (const typeId of jc.implants || []) {
      const slot = await withTimeout(eve.getImplantSlot(typeId), 10000);
      const price = (priceMap.get(typeId) || {}).averagePrice || 0;
      implants.push({ typeId, name: implantNames.get(typeId) || `Implant ${typeId}`, slot, price });
      totalValue += price;
    }
    implants.sort((a, b) => (a.slot || 99) - (b.slot || 99));
    const nickname = nicknames[String(jc.jump_clone_id)]?.name || null;
    jumpClones.push({ name: nickname || jc.name || null, nickname, locationId: jc.location_id, locationName: locationNames.get(jc.location_id) || null, jumpCloneId: jc.jump_clone_id, implants, totalValue });
  }
  let activeClone = null;
  if (detection.status === 'occupied') {
    const jc = detection.clone; const implants = []; let totalValue = 0;
    for (const typeId of jc.implants || []) {
      const slot = await withTimeout(eve.getImplantSlot(typeId), 10000);
      const price = (priceMap.get(typeId) || {}).averagePrice || 0;
      implants.push({ typeId, name: implantNames.get(typeId) || `Implant ${typeId}`, slot, price });
      totalValue += price;
    }
    implants.sort((a, b) => (a.slot || 99) - (b.slot || 99));
    activeClone = { jumpCloneId: jc.jump_clone_id, name: jc.name || null, implants, totalValue, confidence: detection.confidence };
  } else if (detection.status === 'first_run') {
    activeClone = await withTimeout(inferFirstRunActiveClone(id, token, jumpClones, clonesData), 10000);
  }
  let homeLocation = null;
  if (clonesData.home_location && clonesData.home_location.location_id) {
    homeLocation = { locationId: clonesData.home_location.location_id, locationName: locationNames.get(clonesData.home_location.location_id) || null };
  }
  account.clones = { homeLocation, jumpClones, lastCloneJumpDate: clonesData.last_clone_jump_date || null, activeClone, fetchedAt: new Date().toISOString() };
  return account.clones;
}

function registerClonesIpc() {
  ipcMain.handle('accounts:getCloneDetails', async (_event, characterId) => {
    const account = accounts.getAccounts().find((a) => Number(a.characterId) === Number(characterId));
    if (!account) throw new Error('Character not found.');
    try {
      let token = await accounts.getValidAccessToken(account, false);
      try { return await withTimeout(fetchCloneDetails(account, token), 30000); }
      catch (err) {
        if (err && err.status === 401) { token = await accounts.getValidAccessToken(account, true); return await withTimeout(fetchCloneDetails(account, token), 30000); }
        throw err;
      }
    } catch (err) { throw new Error(err?.message || String(err)); }
  });
  ipcMain.handle('cloneNicknames:get', (_event, cloneId) => cloneNicknames.getNickname(cloneId));
  ipcMain.handle('cloneNicknames:set', (_event, cloneId, name) => cloneNicknames.setNickname(cloneId, name));
  ipcMain.handle('cloneNicknames:getAll', () => cloneNicknames.getAllNicknames());
}

module.exports = { registerClonesIpc };
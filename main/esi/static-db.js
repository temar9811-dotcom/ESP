// main/esi/static-db.js
// VERSION: 2.8
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { app } = require('electron');
const logger = require('../debug/logger');

const MAP_PLANETS_DISABLED = true;

let db = null;
let SQL = null;
const DB_URL = 'https://www.fuzzwork.co.uk/dump/latest/eve_3503375_20260910_133002.db.gz';
const GZ_FILE = 'eve_static.db.gz';
const DB_FILE = 'eve_static.db';

function getDbPath() { return path.join(app.getPath('userData'), DB_FILE); }
function getGzPath() { return path.join(app.getPath('userData'), GZ_FILE); }

async function initDb() {
  if (db) return db;
  const dbPath = getDbPath();
  if (!fs.existsSync(dbPath)) {
    logger.warn('STATIC-DB', 'Database not found. Run "Download Static DB" action first.');
    return null;
  }
  try {
    if (!SQL) {
      const initSqlJs = require('sql.js');
      SQL = await initSqlJs();
    }
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
    logger.info('STATIC-DB', 'Database loaded successfully via sql.js');
    return db;
  } catch (err) {
    logger.error('STATIC-DB', 'Failed to load DB', { error: err.message });
    return null;
  }
}

function downloadFile(url, dest, redirectCount = 0) {
  if (redirectCount > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(dest);
    const req = client.get(url, { headers: { 'User-Agent': 'ESP-App/1.0' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        file.close(); fs.unlink(dest, () => {});
        return downloadFile(res.headers.location, dest, redirectCount + 1).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close(); fs.unlink(dest, () => {});
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(resolve); });
    });
    req.on('error', (err) => { file.close(); fs.unlink(dest, () => {}); reject(err); });
  });
}

async function downloadAndExtract() {
  const gzPath = getGzPath();
  const dbPath = getDbPath();
  if (fs.existsSync(dbPath)) return { ok: true, message: 'Already exists' };
  logger.info('STATIC-DB', `Downloading ${DB_URL}...`);
  await downloadFile(DB_URL, gzPath);
  logger.info('STATIC-DB', 'Download complete. Extracting...');
  return new Promise((resolve, reject) => {
    const readStream = fs.createReadStream(gzPath);
    const gunzip = zlib.createGunzip();
    const writeStream = fs.createWriteStream(dbPath);
    let failed = false;
    const onError = (err) => {
      if (failed) return; failed = true;
      readStream.destroy(); gunzip.destroy(); writeStream.destroy();
      fs.unlink(dbPath, () => {}); fs.unlink(gzPath, () => {});
      reject(err);
    };
    readStream.on('error', onError); gunzip.on('error', onError); writeStream.on('error', onError);
    readStream.pipe(gunzip).pipe(writeStream);
    writeStream.on('finish', () => {
      if (!failed) { fs.unlink(gzPath, () => {}); logger.info('STATIC-DB', 'Extraction complete.'); resolve({ ok: true }); }
    });
  });
}

function query(sql, params = []) {
  if (!db) return [];
  try {
    const stmt = db.prepare(sql);
    if (params.length > 0) stmt.bind(params);
    const results = [];
    while (stmt.step()) { results.push(stmt.getAsObject()); }
    stmt.free();
    return results;
  } catch (err) {
    logger.error('STATIC-DB', 'Query failed', { error: err.message, sql });
    return [];
  }
}

function getTypeName(typeId) {
  const row = query('SELECT typeName FROM invTypes WHERE typeID = ?', [typeId]);
  return row[0]?.typeName || null;
}

function getSystemName(systemId) {
  const row = query('SELECT solarSystemName FROM mapSolarSystems WHERE solarSystemID = ?', [systemId]);
  return row[0]?.solarSystemName || null;
}

function getStationName(stationId) {
  const row = query('SELECT stationName FROM staStations WHERE stationID = ?', [stationId]);
  return row[0]?.stationName || null;
}

function getSkillInfo(skillId) {
  const row = query('SELECT typeID, typeName, groupID FROM invTypes WHERE typeID = ?', [skillId]);
  if (!row[0]) return null;
  const group = row[0].groupID ? query('SELECT groupName FROM invGroups WHERE groupID = ?', [row[0].groupID])[0] : null;
  return { id: row[0].typeID, name: row[0].typeName, groupName: group?.groupName || 'Unknown Group' };
}

function getAllSkills() {
  if (!db) return null;
  return query(
    `SELECT t.typeID AS id, t.typeName AS name, g.groupName AS groupName,
            COALESCE(r.valueFloat, r.valueInt) AS rank,
            COALESCE(pa.valueFloat, pa.valueInt) AS primaryAttr,
            COALESCE(sa.valueFloat, sa.valueInt) AS secondaryAttr
     FROM invTypes t
     JOIN invGroups g ON g.groupID = t.groupID
     LEFT JOIN dgmTypeAttributes r ON r.typeID = t.typeID AND r.attributeID = 275
     LEFT JOIN dgmTypeAttributes pa ON pa.typeID = t.typeID AND pa.attributeID = 180
     LEFT JOIN dgmTypeAttributes sa ON sa.typeID = t.typeID AND sa.attributeID = 181
     WHERE g.categoryID = 16 AND t.published = 1
     ORDER BY g.groupName, t.typeName`
  );
}

function getPlanetName(planetId) {
  if (MAP_PLANETS_DISABLED) return null;
  const row = query('SELECT planetName FROM mapPlanets WHERE planetID = ?', [planetId]);
  return row[0]?.planetName || null;
}

function getLocationHierarchy(id) {
  const locId = parseInt(id);
  if (!locId) return null;

  // Check if it's a station
  const station = query('SELECT stationName, solarSystemID FROM staStations WHERE stationID = ?', [locId])[0];
  if (station) {
    const system = query('SELECT solarSystemName, regionID FROM mapSolarSystems WHERE solarSystemID = ?', [station.solarSystemID])[0];
    if (system) {
      const region = query('SELECT regionName FROM mapRegions WHERE regionID = ?', [system.regionID])[0];
      return { regionName: region?.regionName || 'Unknown Region', systemName: system.solarSystemName, locationName: station.stationName };
    }
  }

  let planet = null;
  if (!MAP_PLANETS_DISABLED) {
    planet = query('SELECT planetName, solarSystemID FROM mapPlanets WHERE planetID = ?', [locId])[0];
  }
  if (planet) {
    const system = query('SELECT solarSystemName, regionID FROM mapSolarSystems WHERE solarSystemID = ?', [planet.solarSystemID])[0];
    if (system) {
      const region = query('SELECT regionName FROM mapRegions WHERE regionID = ?', [system.regionID])[0];
      return { regionName: region?.regionName || 'Unknown Region', systemName: system.solarSystemName, locationName: planet.planetName };
    }
  }

  // Check if it's a solar system
  const system = query('SELECT solarSystemName, regionID FROM mapSolarSystems WHERE solarSystemID = ?', [locId])[0];
  if (system) {
    const region = query('SELECT regionName FROM mapRegions WHERE regionID = ?', [system.regionID])[0];
    return { regionName: region?.regionName || 'Unknown Region', systemName: system.solarSystemName, locationName: system.solarSystemName };
  }

  return null;
}

function getSystemInfo(systemId) {
  const row = query('SELECT solarSystemID, solarSystemName, regionID FROM mapSolarSystems WHERE solarSystemID = ?', [systemId]);
  if (!row[0]) return null;
  const region = query('SELECT regionName FROM mapRegions WHERE regionID = ?', [row[0].regionID])[0];
  return {
    systemId: row[0].solarSystemID,
    systemName: row[0].solarSystemName,
    regionId: row[0].regionID,
    regionName: region?.regionName || null
  };
}

module.exports = { downloadAndExtract, query, getTypeName, getSystemName, getStationName, getPlanetName, getSkillInfo, getAllSkills, getLocationHierarchy, getSystemInfo, initDb };
// main/esi/static-db.js
// VERSION: 2.2
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const zlib = require('zlib');
const { app } = require('electron');
const logger = require('../debug/logger');

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

// Fixed: table is crpNPCCorporations, not crpCorporations
// Note: Only NPC corps exist in the SDE. Player corps return null.
function getCorporationName(corpId) {
  const row = query('SELECT corporationName FROM crpNPCCorporations WHERE corporationID = ?', [corpId]);
  return row[0]?.corporationName || null;
}

module.exports = { downloadAndExtract, query, getTypeName, getSystemName, getCorporationName, initDb };
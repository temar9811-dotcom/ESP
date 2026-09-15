// File: main/esi/fetcher.js | Version: 1.0
'use strict';
const https = require('https');
const logger = require('../debug/logger');

class EsiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

function request(url, token, etag) {
  return new Promise((resolve, reject) => {
    const headers = { 'User-Agent': 'ESP-App', 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    if (etag) headers['If-None-Match'] = etag;

    const req = https.get(url, { headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 304) return resolve({ notModified: true, etag: res.headers['etag'] });
        
        // STRICT RULE: Never swallow 420/429. Throw them.
        if (res.statusCode === 420 || res.statusCode === 429) {
          logger.error('FETCHER', 'Rate limited', { status: res.statusCode, url });
          return reject(new EsiError(res.statusCode, 'Rate limited'));
        }
        
        if (res.statusCode >= 400) {
          return reject(new EsiError(res.statusCode, `HTTP ${res.statusCode}`));
        }
        
        try {
          const json = JSON.parse(data);
          resolve({ data: json, etag: res.headers['etag'] });
        } catch (e) { 
          reject(new Error('Invalid JSON')); 
        }
      });
    });
    
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

module.exports = { request, EsiError };
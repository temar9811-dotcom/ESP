// main/esi/fetcher.js
// VERSION: 1.1
'use strict';
const https = require('https');
const http = require('http');
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
        if (res.statusCode === 420 || res.statusCode === 429) return reject(new EsiError(res.statusCode, 'Rate limited'));
        if (res.statusCode >= 400) return reject(new EsiError(res.statusCode, `HTTP ${res.statusCode}`));
        try { resolve({ data: JSON.parse(data), etag: res.headers['etag'] }); } catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

function postRequest(url, body, token) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const client = urlObj.protocol === 'https:' ? https : http;
    const payload = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'User-Agent': 'ESP-App', 'Accept': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const req = client.request(url, { method: 'POST', headers }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 420 || res.statusCode === 429) return reject(new EsiError(res.statusCode, 'Rate limited'));
        if (res.statusCode >= 400) return reject(new EsiError(res.statusCode, `HTTP ${res.statusCode}`));
        try { resolve({ data: JSON.parse(data) }); } catch (e) { reject(new Error('Invalid JSON')); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(payload);
    req.end();
  });
}

module.exports = { request, postRequest, EsiError };
// FILE: main/assets-fetch.js
// VERSION: 1.1.16-beta
'use strict';
const { esiFetchWithHeaders, publicFetch, esiFetch } = require('../eve/http');
const debug = require('./debug');

async function fetchAllPages(baseUrl, accessToken) {
  const all = [];
  const maxPages = 100;
  let totalPages = null;

  for (let page = 1; page <= maxPages; page++) {
    const url = `${baseUrl}?page=${page}`;
    let data;

    if (accessToken) {
      const res = await esiFetchWithHeaders(url, accessToken);
      data = res.data;
      if (page === 1 && res.headers.xPages != null) {
        totalPages = res.headers.xPages;
      }
    } else {
      data = await publicFetch(url);
    }

    debug.log(
      'assets',
      `page ${page}/${totalPages || '?'} ${baseUrl}: ${Array.isArray(data) ? data.length : 'non-array'} item(s)`
    );

    if (!Array.isArray(data) || data.length === 0) break;
    all.push(...data);

    if (totalPages != null) {
      if (page >= totalPages) break;
    } else if (data.length < 1000) {
      break;
    }
  }

  return all;
}

async function getCharacterAssets(characterId, accessToken) {
  return fetchAllPages(`/characters/${characterId}/assets/`, accessToken);
}

async function getCorpAssets(corpId, accessToken) {
  return fetchAllPages(`/corporations/${corpId}/assets/`, accessToken);
}

module.exports = {
  getCharacterAssets,
  getCorpAssets
};
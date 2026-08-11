'use strict';

const config = require('./config');

function normalizePath(path) {
  return path.startsWith('/') ? path : `/${path}`;
}

async function handleResponse(res, label) {
  if (res.status === 204) {
    return null;
  }

  if (!res.ok) {
    const err = new Error(`${label} failed: ${res.status}`);
    err.status = res.status;

    try {
      const text = await res.text();
      if (text) {
        err.details = text;
      }
    } catch {
      // Ignore body-read errors.
    }

    throw err;
  }

  return res.json();
}

async function esiFetch(path, accessToken) {
  const safePath = normalizePath(path);

  const res = await fetch(`${config.ESI_BASE}${safePath}`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': config.USER_AGENT,
      'X-User-Agent': config.USER_AGENT
    }
  });

  return handleResponse(res, `ESI ${safePath}`);
}

async function publicFetch(path) {
  const safePath = normalizePath(path);

  const res = await fetch(`${config.ESI_BASE}${safePath}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': config.USER_AGENT
    }
  });

  return handleResponse(res, `ESI ${safePath}`);
}

async function publicPost(path, body) {
  const safePath = normalizePath(path);

  const res = await fetch(`${config.ESI_BASE}${safePath}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': config.USER_AGENT
    },
    body: JSON.stringify(body)
  });

  return handleResponse(res, `ESI ${safePath}`);
}

module.exports = {
  esiFetch,
  publicFetch,
  publicPost
};
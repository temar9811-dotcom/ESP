'use strict';

const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');

const config = require('./config');
const scopesModule = require('../scopes');

let cancelActiveLogin = null;

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

function resolveScopeList(scopeChoice) {
  if (Array.isArray(scopesModule)) {
    return scopesModule;
  }

  return scopeChoice === 'essential'
    ? scopesModule.ESSENTIAL_SCOPES
    : scopesModule.FUTURE_PROOF_SCOPES;
}

function waitForCallback(expectedState) {
  const redirectUrl = new URL(config.SSO.redirectUri);
  const listenHost =
    redirectUrl.hostname === 'localhost' ? '127.0.0.1' : redirectUrl.hostname;
  const listenPort = Number(
    redirectUrl.port || (redirectUrl.protocol === 'https:' ? 443 : 80)
  );

  let cancel = () => {};

  const promise = new Promise((resolve, reject) => {
    let finished = false;

    const finish = (fn, value) => {
      if (finished) return;
      finished = true;

      try {
        server.close();
      } catch {
        // ignore
      }

      fn(value);
    };

    cancel = () => finish(reject, new Error('Login cancelled.'));

    const server = http.createServer((req, res) => {
      const url = new URL(req.url || '/', config.SSO.redirectUri);

      if (url.pathname !== redirectUrl.pathname) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');

      res.setHeader('Content-Type', 'text/plain');
      res.end('EVE login complete. You can close this tab and return to the app.');

      if (error) {
        finish(reject, new Error(`EVE login error: ${error}`));
        return;
      }

      if (!code || state !== expectedState) {
        finish(reject, new Error('Invalid OAuth callback.'));
        return;
      }

      finish(resolve, code);
    });

    server.on('error', (err) => {
      finish(reject, err);
    });

    server.listen(listenPort, listenHost);

    setTimeout(() => {
      finish(reject, new Error('Login timed out.'));
    }, config.SSO.loginTimeoutMs).unref();
  });

  return { promise, cancel };
}

function cancelLogin() {
  if (cancelActiveLogin) {
    const cancel = cancelActiveLogin;
    cancelActiveLogin = null;
    cancel();
  }
}

async function exchangeCode(code, verifier) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: config.SSO.clientId,
    code,
    redirect_uri: config.SSO.redirectUri,
    code_verifier: verifier
  });

  const res = await fetch(config.SSO.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.USER_AGENT
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + Number(data.expires_in || 1199) * 1000,
    scopes: data.scope
  };
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: config.SSO.clientId,
    refresh_token: refreshToken
  });

  const res = await fetch(config.SSO.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': config.USER_AGENT
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token refresh failed: ${res.status} ${text}`);
  }

  const data = await res.json();

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || refreshToken,
    expiresAt: Date.now() + Number(data.expires_in || 1199) * 1000
  };
}

async function getCharacterFromToken(accessToken) {
  try {
    const res = await fetch(config.SSO.verifyUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'User-Agent': config.USER_AGENT
      }
    });

    if (res.ok) {
      const data = await res.json();

      if (data.CharacterID) {
        return {
          characterId: Number(data.CharacterID),
          characterName: data.CharacterName || 'Unknown'
        };
      }
    }
  } catch {
    // fall back to JWT decode
  }

  try {
    const payloadPart = accessToken.split('.')[1];
    const payload = JSON.parse(
      Buffer.from(payloadPart, 'base64url').toString('utf8')
    );

    const characterId = Number(String(payload.sub || '').split(':').pop());

    if (!characterId || Number.isNaN(characterId)) {
      throw new Error('Could not parse character ID from token.');
    }

    return {
      characterId,
      characterName: payload.name || payload.character_name || 'Unknown'
    };
  } catch {
    throw new Error('Could not identify character from token.');
  }
}

async function startLogin(promptLogin = true, scopeChoice = 'future') {
  cancelLogin();

  const { verifier, challenge } = generatePkce();
  const state = base64url(crypto.randomBytes(16));

  const scopes = resolveScopeList(scopeChoice).join(' ');

  const authUrl = new URL(config.SSO.authorizeUrl);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', config.SSO.clientId);
  authUrl.searchParams.set('redirect_uri', config.SSO.redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', challenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  if (promptLogin) {
    authUrl.searchParams.set('prompt', 'login');
  }

  const wait = waitForCallback(state);
  cancelActiveLogin = wait.cancel;

  await shell.openExternal(authUrl.toString());

  try {
    const code = await wait.promise;
    const tokens = await exchangeCode(code, verifier);
    const character = await getCharacterFromToken(tokens.accessToken);
    return { ...tokens, ...character };
  } finally {
    if (cancelActiveLogin === wait.cancel) {
      cancelActiveLogin = null;
    }
  }
}

module.exports = {
  startLogin,
  refreshAccessToken,
  cancelLogin
};
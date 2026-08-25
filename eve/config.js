'use strict';

const { VERSION } = require('../version');
const SCOPES = require('../scopes');

const APP_NAME = 'EVE Status Perception';
const CONTACT_EMAIL = 'Temar9811@gmail.com';

module.exports = {
  APP_NAME,
  APP_USER_MODEL_ID: 'com.esp.app',
  CONTACT_EMAIL,
  VERSION,

  USER_AGENT: `${APP_NAME}/${VERSION} (${CONTACT_EMAIL})`,

  SSO: {
    clientId: '276100afb30f4c3eb527d65f2ec7c3e5',
    redirectUri: 'http://127.0.0.1:8635/callback',
    scopes: SCOPES,

    authorizeUrl: 'https://login.eveonline.com/v2/oauth/authorize',
    tokenUrl: 'https://login.eveonline.com/v2/oauth/token',
    verifyUrl: 'https://login.eveonline.com/oauth/verify',

    loginTimeoutMs: 180000
  },

  ESI_BASE: 'https://esi.evetech.net/latest',

  WALLET: {
    defaultDetailDays: 7,
    monitorEntryLimit: 5,
    journalMaxPages: 5,
    transactionMaxPages: 5
  },

  REFRESH: {
    intervalMs: 60000,
    tokenExpirySafetyMs: 60000
  },

  WALLET_MONITOR: {
    intervalMs: 120000
  },

  // Sequenced skills pull: first section to run at startup, then every
  // 15 minutes. Calls go out in batches of 10 with a pause between
  // batches so 40+ character rosters stay well under ESI rate limits.
  SKILLS: {
    intervalMs: 15 * 60 * 1000,
    batchSize: 10,
    batchDelayMs: 1500
  },

  // Sequenced wallet pull: second section (after skills), then every
  // 10 minutes. Journal + transactions for each character, batched the
  // same way skills are.
  WALLET_SYNC: {
    intervalMs: 10 * 60 * 1000,
    batchSize: 10,
    batchDelayMs: 1500
  }
};
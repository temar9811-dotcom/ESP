'use strict';

const config = require('./config');
const { esiFetch, publicFetch, publicPost } = require('./http');
const { startLogin, refreshAccessToken } = require('./sso');
const {
  getDashboard,
  getTypeNames,
  getSkillIdsFromNames
} = require('./dashboard');
const {
  getWalletDetails,
  getRecentWalletEntries,
  resolveNames,
  formatRefType
} = require('./wallet');

module.exports = {
  config,

  esiFetch,
  publicFetch,
  publicPost,

  startLogin,
  refreshAccessToken,

  getDashboard,
  getTypeNames,
  getSkillIdsFromNames,

  getWalletDetails,
  getRecentWalletEntries,
  resolveNames,
  formatRefType
};
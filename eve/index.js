'use strict';

const config = require('./config');
const { esiFetch, publicFetch, publicPost } = require('./http');
const { startLogin, refreshAccessToken } = require('./sso');
const {
  getDashboard,
  getTypeNames,
  getSkillIdsFromNames,
  resolveLocationName
} = require('./dashboard');
const {
  getWalletDetails,
  getRecentWalletEntries,
  resolveNames,
  formatRefType
} = require('./wallet');
const {
  getClones,
  getMarketPrices,
  getImplantSlot,
  inferActiveClone,
  loadImplantSlotCache
} = require('./clones');

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
  resolveLocationName,

  getClones,
  getMarketPrices,
  getImplantSlot,
  inferActiveClone,
  loadImplantSlotCache,

  getWalletDetails,
  getRecentWalletEntries,
  resolveNames,
  formatRefType
};
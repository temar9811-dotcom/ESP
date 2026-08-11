'use strict';

// Migration shim.
// This root eve.js now re-exports from the modular eve/ folder.
// Once all consumers are updated to require the eve folder directly,
// this file can be removed and require('./eve') will auto-resolve
// to eve/index.js.
module.exports = require('./eve/index.js');
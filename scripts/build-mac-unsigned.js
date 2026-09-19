'use strict';

// Build a deliberately unsigned, non-notarized tester package. Keep this
// configuration in code so it derives from the normal package configuration
// without duplicating its app files, targets, or output location.
const fs = require('fs');
const path = require('path');
const { build, Platform } = require('electron-builder');

const root = path.resolve(__dirname, '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const baseConfig = packageJson.build || {};

const config = {
  ...baseConfig,
  mac: {
    ...(baseConfig.mac || {}),
    identity: null,
    hardenedRuntime: false,
    notarize: false
  }
};

build({
  targets: Platform.MAC.createTarget(),
  config,
  projectDir: root
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

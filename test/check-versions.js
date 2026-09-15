// File: check-versions.js | Version: 1.1
const fs = require('fs');
const path = require('path');

const targets = [
  'ui/src/hooks/useEveApi.js',
  'main/ipc.js',
  'eve/dashboard.js',
  'eve/dashboard-helpers.js',
  'eve/wallet.js',
  'eve/wallet-fetch.js',
  'check-versions.js',
  'run-check.bat'
];

const headerRegex = /^(?:\/\/|REM) File: .* \| Version: \d+\.\d+/i;
let failed = false;

for (const target of targets) {
  const filePath = path.join(process.cwd(), target);
  if (!fs.existsSync(filePath)) {
    console.log(`[MISSING] ${target}`);
    failed = true;
    continue;
  }
  const firstLine = fs.readFileSync(filePath, 'utf8').split(/\r?\n/)[0].trim();
  if (headerRegex.test(firstLine)) {
    console.log(`[OK] ${target}`);
  } else {
    console.log(`[BAD] ${target}: ${firstLine || 'missing header'}`);
    failed = true;
  }
}
process.exit(failed ? 1 : 0);
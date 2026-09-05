// File Version: 1.1.15-beta
const fs = require('fs');
const path = require('path');

const TARGET_FILES = [
  'test/test-pilots.js', 'test/test-main.js', 'renderer/test-panel.js',
  'main/accounts.js', 'main/ipc.js', 'preload.js'
];

let pass = 0;
let fail = 0;

console.log('--- File Version Check ---');
for (const file of TARGET_FILES) {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) { console.log(`[MISSING] ${file}`); fail++; continue; }
  const content = fs.readFileSync(fullPath, 'utf8');
  if (content.startsWith('// File Version:')) { console.log(`[PASS]   ${file}`); pass++; }
  else { console.log(`[FAIL]   ${file} (missing version header)`); fail++; }
}
console.log(`\nResults: ${pass} passed, ${fail} failed.`);
process.exit(fail > 0 ? 1 : 0);
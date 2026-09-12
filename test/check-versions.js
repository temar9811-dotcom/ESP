// File: check-versions.js | Version: 1.0
const fs = require('fs');
const path = require('path');

const TARGETS = {
  'test/test-pilots.js': '1.0',
  'test/test-main.js': '1.0',
  'renderer/test-panel.js': '1.0',
  'main/accounts.js': '1.0',
  'main/ipc.js': '1.0',
  'preload.js': '1.1.16-beta',
  'ui/src/App.jsx': '1.2',
  'ui/src/components/Topbar.jsx': '1.0',
  'ui/src/components/Sidebar.jsx': '1.0',
  'ui/src/components/global/ToastContainer.jsx': '1.0',
  'ui/src/components/global/SyncIndicator.jsx': '1.0',
  'ui/src/components/global/TestPanel.jsx': '1.0',
  'ui/src/components/character/Overview.jsx': '1.0',
  'ui/src/components/character/Skills.jsx': '1.0',
  'ui/src/components/character/Wallet.jsx': '1.0',
  'ui/src/components/character/Assets.jsx': '1.0',
  'ui/src/components/character/Clones.jsx': '1.0',
  'ui/src/components/character/Notes.jsx': '1.0',
  'ui/src/components/character/SkillPlans.jsx': '1.0',
  'ui/src/components/modals/AddCharacterModal.jsx': '1.0',
  'ui/src/components/modals/SettingsModal.jsx': '1.0',
  'ui/src/components/modals/SkillPlanModal.jsx': '1.0'
};

function extractVersion(content) {
  let m = content.match(/\/\/\s*File Version:\s*([^\s]+)/i);
  if (m) return m[1];
  m = content.match(/\/\/\s*VERSION:\s*([^\s]+)/i);
  if (m) return m[1];
  m = content.match(/\/\/\s*File:.*?\|\s*Version:\s*([^\s]+)/i);
  if (m) return m[1];
  return null;
}

let pass = 0, fail = 0, missing = 0;
console.log('--- File Version Check ---');
for (const [file, expected] of Object.entries(TARGETS)) {
  const fullPath = path.join(__dirname, '..', file);
  if (!fs.existsSync(fullPath)) {
    console.log(`[MISSING] ${file}`);
    missing++;
    continue;
  }
  const content = fs.readFileSync(fullPath, 'utf8');
  const version = extractVersion(content);
  if (!version) {
    console.log(`[FAIL] ${file} (no version header)`);
    fail++;
  } else if (expected && version !== expected) {
    console.log(`[FAIL] ${file} (expected ${expected}, got ${version})`);
    fail++;
  } else {
    console.log(`[PASS] ${file} (${version})`);
    pass++;
  }
}
console.log(`\nResults: ${pass} passed, ${fail} failed, ${missing} missing.`);
process.exit(fail + missing > 0 ? 1 : 0);
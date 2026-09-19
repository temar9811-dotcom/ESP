'use strict';

// Generate the .icns bundle required by macOS from the source PNG already
// tracked by this project. This intentionally runs only on macOS because it
// relies on Apple's bundled sips and iconutil tools.
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  console.error('The macOS icon can only be generated on macOS (sips/iconutil are required).');
  process.exit(1);
}

const root = path.resolve(__dirname, '..');
const sourceIcon = path.join(root, 'build', 'icon.png');
const iconsetDir = path.join(root, 'build', 'icon.iconset');
const outputIcon = path.join(root, 'build', 'icon.icns');

if (!fs.existsSync(sourceIcon)) {
  console.error(`Missing source icon: ${sourceIcon}`);
  process.exit(1);
}

fs.mkdirSync(iconsetDir, { recursive: true });

const variants = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024]
];

for (const [name, size] of variants) {
  execFileSync('sips', ['-z', String(size), String(size), sourceIcon, '--out', path.join(iconsetDir, name)], {
    stdio: 'inherit'
  });
}

execFileSync('iconutil', ['-c', 'icns', iconsetDir, '-o', outputIcon], { stdio: 'inherit' });
console.log(`Created ${outputIcon}`);

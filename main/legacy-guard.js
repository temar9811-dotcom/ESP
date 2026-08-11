'use strict';

const { dialog } = require('electron');
const { execSync } = require('child_process');

const LEGACY_PROCESS_NAMES = ['EVE Skill Tray.exe'];

function findLegacyProcesses() {
  if (process.platform !== 'win32') {
    return [];
  }

  let output = '';

  try {
    output = execSync('tasklist /FO CSV /NH', {
      encoding: 'utf8',
      windowsHide: true
    });
  } catch {
    return [];
  }

  const running = [];
  const lowerOutput = output.toLowerCase();

  for (const name of LEGACY_PROCESS_NAMES) {
    const needle = `"${name.toLowerCase()}"`;

    if (lowerOutput.includes(needle)) {
      running.push(name);
    }
  }

  return running;
}

function ensureLegacyAppClosed() {
  let running = findLegacyProcesses();

  while (running.length) {
    const choice = dialog.showMessageBoxSync({
      type: 'warning',
      title: 'EVE Status Perception',
      message: 'EVE Skill Tray is still running.',
      detail:
        'Running both apps at the same time breaks EVE SSO refresh tokens ' +
        'for shared characters, because every token refresh invalidates the ' +
        'other app\'s copy.\n\n' +
        'Close EVE Skill Tray completely (tray icon, then Quit) and press ' +
        '"Retry check", or quit ESP and keep using the old app.',
      buttons: ['Retry check', 'Quit ESP'],
      defaultId: 0,
      cancelId: 1
    });

    if (choice === 1) {
      return false;
    }

    running = findLegacyProcesses();
  }

  return true;
}

module.exports = {
  ensureLegacyAppClosed,
  findLegacyProcesses
};

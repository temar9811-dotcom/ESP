// version.js
// Centralized version management for EVE Status Perception (ESP)

const VERSION = '1.1.6';

/**
 * Calculates the next semantic version bump.
 * Currently increments the patch version. Rolls over to minor/major if > 99.
 * @param {string} version - The current version string (e.g., '1.1.0')
 * @returns {string} The bumped version string
 */
function bumpVersion(version = VERSION) {
  let [major, minor, patch] = String(version)
    .split('.')
    .map((n) => Number(n) || 0);
  
  patch += 1;
  if (patch > 99) {
    patch = 0;
    minor += 1;
  }
  if (minor > 99) {
    minor = 0;
    major += 1;
  }
  
  return `${major}.${minor}.${patch}`;
}

module.exports = {
  VERSION,
  bumpVersion
};
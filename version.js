const VERSION = '1.1.0';
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
const { app, safeStorage } = require('electron');
const fs = require('fs');
const path = require('path');
function getDataFile() {
return path.join(app.getPath('userData'), 'accounts.json');
}
function loadAccounts() {
try {
const raw = fs.readFileSync(getDataFile(), 'utf8');
const data = JSON.parse(raw);
return Array.isArray(data) ? data : [];
} catch {
return [];
}
}
function saveAccounts(accounts) {
const file = getDataFile();
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(accounts, null, 2), 'utf8');
}
function encryptSecret(value) {
if (!value) return '';
if (safeStorage.isEncryptionAvailable()) {
return safeStorage.encryptString(value).toString('base64');
}
return Buffer.from(value, 'utf8').toString('base64');
}
function decryptSecret(value) {
if (!value) return '';
if (safeStorage.isEncryptionAvailable()) {
try {
return safeStorage.decryptString(Buffer.from(value, 'base64'));
} catch {
// Fall through to base64 fallback
}
}
return Buffer.from(value, 'base64').toString('utf8');
}
module.exports = {
loadAccounts,
saveAccounts,
encryptSecret,
decryptSecret
};
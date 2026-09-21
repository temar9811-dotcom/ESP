// main/native-notifications.js
// VERSION: 1.0
'use strict';

const { Notification } = require('electron');
const logger = require('./debug/logger');

// Wrapper around Electron's built-in Notification API so the app can
// surface OS-level alerts on every platform:
//   macOS   -> Notification Center
//   Windows -> Action Center toasts
//   Linux   -> libnotify / DBus
// The overlay (toast-window.js) stays available for Windows-only styling;
// everything else routes here.

function show(title, body, sound) {
  if (!Notification.isSupported()) {
    logger.warn('NATIVE-NOTIFY', 'Notification API not supported; dropped notification', { title });
    return false;
  }

  const notification = new Notification({
    title: String(title || ''),
    body: String(body || ''),
    // Custom overlay chimes don't exist cross-platform; a non-null sound
    // plays the OS default notification sound, null keeps it silent.
    silent: !sound
  });

  notification.show();
  logger.debug('NATIVE-NOTIFY', 'Shown', { title, body });
  return true;
}

module.exports = { show };
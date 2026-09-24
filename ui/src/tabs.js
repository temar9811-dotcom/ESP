// ui/src/tabs.js
// Shared tab registry. Debug is intentionally excluded (developer-only,
// gated by isDev in App.jsx) and cannot be hidden by Tab Activation.
export const USER_TABS = ['overview', 'skills', 'wallet', 'assets', 'clones', 'notifications', 'notes', 'plans'];

export const TAB_LABELS = {
  overview: 'Overview',
  skills: 'Skills',
  wallet: 'Wallet',
  assets: 'Assets',
  clones: 'Clones',
  notifications: 'Notifications',
  notes: 'Notes',
  plans: 'Skill Plans'
};

export const DEFAULT_ENABLED_TABS = [...USER_TABS];
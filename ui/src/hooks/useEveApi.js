// File Version: 1.2.1-alpha
import { useEffect, useState } from 'react';

// Fallback for browser testing outside Electron
const api = window.eveApi || {
  listAccounts: async () => [],
  getRefreshState: async () => ({ refreshing: false, rateLimitedUntil: 0 }),
  getVersion: async () => 'dev',
  onAccountsUpdated: () => () => {},
  onRefreshState: () => () => {},
  refreshAll: async () => {},
  addAccount: async () => {},
  removeAccount: async () => {}
};

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);
  useEffect(() => {
    api.listAccounts().then(setAccounts);
    const unsub = api.onAccountsUpdated(setAccounts);
    return unsub;
  }, []);
  return accounts;
}

export function useRefreshState() {
  const [state, setState] = useState({ refreshing: false, rateLimitedUntil: 0 });
  useEffect(() => {
    api.getRefreshState().then(setState);
    const unsub = api.onRefreshState(setState);
    return unsub;
  }, []);
  return state;
}

export function useVersion() {
  const [version, setVersion] = useState('');
  useEffect(() => { api.getVersion().then(setVersion); }, []);
  return version;
}

export const eveApi = api;
// File: ui/src/hooks/useEveApi.js | Version: 1.4
import { useEffect, useState } from 'react';

const sendDebugLog = (level, source, message, data) => {
  try {
    if (window.eveApi?.debugLog) {
      window.eveApi.debugLog({ level, source, message, data });
    } else {
      console.log(`[${source}] ${message}`, data || '');
    }
  } catch {}
};

const log = (source, message, data) => sendDebugLog('DEBUG', source, message, data);

const api = window.eveApi || {
  listAccounts: async () => { log('USE-EVE-API', 'fallback listAccounts'); return []; },
  getRefreshState: async () => { log('USE-EVE-API', 'fallback getRefreshState'); return { refreshing: false, rateLimitedUntil: 0 }; },
  getVersion: async () => { log('USE-EVE-API', 'fallback getVersion'); return 'dev'; },
  onAccountsUpdated: () => () => {},
  onRefreshState: () => () => {},
  refreshAll: async () => log('USE-EVE-API', 'fallback refreshAll'),
  addAccount: async () => log('USE-EVE-API', 'fallback addAccount'),
  removeAccount: async () => log('USE-EVE-API', 'fallback removeAccount')
};

export function useAccounts() {
  const [accounts, setAccounts] = useState([]);

  useEffect(() => {
    log('USE-EVE-API', 'useAccounts: fetching initial list');
    api.listAccounts().then((next) => {
      log('USE-EVE-API', 'useAccounts: initial list', { count: next?.length ?? 0 });
      setAccounts(next);
    });

    const unsub = api.onAccountsUpdated((next) => {
      log('USE-EVE-API', 'useAccounts: updated', { count: next?.length ?? 0 });
      setAccounts(next);
    });

    return unsub;
  }, []);

  return accounts;
}

export function useRefreshState() {
  const [state, setState] = useState({ refreshing: false, rateLimitedUntil: 0 });

  useEffect(() => {
    log('USE-EVE-API', 'useRefreshState: fetching initial state');
    api.getRefreshState().then((next) => {
      log('USE-EVE-API', 'useRefreshState: initial state', next);
      setState(next);
    });

    const unsub = api.onRefreshState((next) => {
      log('USE-EVE-API', 'useRefreshState: updated', next);
      setState(next);
    });

    return unsub;
  }, []);

  return state;
}

export function useVersion() {
  const [version, setVersion] = useState('');

  useEffect(() => {
    log('USE-EVE-API', 'useVersion: fetching');
    api.getVersion().then((next) => {
      log('USE-EVE-API', 'useVersion: resolved', { version: next });
      setVersion(next);
    });
  }, []);

  return version;
}

export const eveApi = api;
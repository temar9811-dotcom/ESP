// File: ui/src/hooks/useDebug.js | Version: 1.1
import { useEffect, useState } from 'react';

export function useDebugLogs() {
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    if (!window.eveApi?.debugGetLogs) return;

    const fetchInitial = async () => {
      const initial = await window.eveApi.debugGetLogs();
      setLogs(initial || []);
    };

    fetchInitial();

    const unsub = window.eveApi.onDebugLog((entry) => {
      setLogs((prev) => [...prev, entry].slice(-500));
    });

    return () => {
      if (unsub) unsub();
    };
  }, []);

  const clearLogs = async () => {
    if (!window.eveApi?.debugClearLogs) return;
    await window.eveApi.debugClearLogs();
    const fresh = await window.eveApi.debugGetLogs();
    setLogs(fresh || []);
  };

  return { logs, clearLogs };
}

export function useDebugActions() {
  const [actions, setActions] = useState([]);

  useEffect(() => {
    if (!window.eveApi?.debugGetActions) return;

    const fetchActions = async () => {
      const list = await window.eveApi.debugGetActions();
      setActions(list || []);
    };

    fetchActions();
  }, []);

  return actions;
}
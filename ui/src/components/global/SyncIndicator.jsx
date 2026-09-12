// File: ui/src/components/global/SyncIndicator.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function SyncIndicator() {
  const [state, setState] = useState({ isSyncing: false, message: '' });

  useEffect(() => {
    if (!window.eveApi) return;
    const unsub = window.eveApi.onRefreshState((payload) => {
      setState({ isSyncing: payload.isSyncing, message: payload.message || '' });
    });
    return () => unsub();
  }, []);

  if (!state.isSyncing) return null;

  return (
    <div className="bg-blue-900 text-blue-200 text-xs px-3 py-1 text-center border-b border-blue-800">
      <span className="inline-block w-2 h-2 bg-blue-400 rounded-full mr-2 animate-pulse"></span>
      Syncing: {state.message}
    </div>
  );
}
// File: ui/src/components/Topbar.jsx | Version: 1.0
import React, { useState } from 'react';
import { useVersion, useRefreshState, eveApi } from '../hooks/useEveApi';
import AddCharacterModal from './modals/AddCharacterModal';
import SettingsModal from './modals/SettingsModal';

export default function Topbar() {
  const version = useVersion();
  const { refreshing } = useRefreshState();
  const [showAdd, setShowAdd] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const handleRefresh = () => eveApi.refreshAll().catch(console.error);

  return (
    <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-blue-400">ESP</h1>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {refreshing ? 'Refreshing...' : 'Refresh'}
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-500"
        >
          Add Character
        </button>
        <button
          onClick={() => setShowSettings(true)}
          className="rounded bg-gray-600 px-3 py-1 text-sm font-medium text-white hover:bg-gray-500"
        >
          Settings
        </button>
      </div>

      {showAdd && <AddCharacterModal onClose={() => setShowAdd(false)} />}
      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </header>
  );
}
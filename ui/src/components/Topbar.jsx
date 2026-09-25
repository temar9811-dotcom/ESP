// File: ui/src/components/Topbar.jsx | Version: 1.3
import React, { useState } from 'react';
import { useVersion, useRefreshState, eveApi } from '../hooks/useEveApi';
import AddCharacterModal from './modals/AddCharacterModal';
import NewGroupModal from './modals/NewGroupModal';

export default function Topbar({ onOpenSettings, isSettingsOpen }) {
  const version = useVersion();
  const { refreshing } = useRefreshState();
  const [showAdd, setShowAdd] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupError, setGroupError] = useState('');

  const handleRefresh = () => eveApi.refreshAll().catch(console.error);

  const handleNewGroup = async (name) => {
    const clean = (name || '').trim();
    if (!clean) return;
    try {
      await eveApi.createGroup(clean);
      setGroupError('');
    } catch (err) {
      setGroupError(err?.message || String(err));
      throw err;
    }
  };

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
          onClick={() => setShowNewGroup(true)}
          className="rounded bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-500"
          title="Create a new character group"
        >
          New Group
        </button>
        <button
          onClick={() => setShowAdd(true)}
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-500"
        >
          Add Character
        </button>
        <button
          onClick={onOpenSettings}
          disabled={isSettingsOpen}
          className="rounded bg-gray-600 px-3 py-1 text-sm font-medium text-white hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Settings
        </button>
      </div>
      {showAdd && <AddCharacterModal onClose={() => setShowAdd(false)} />}
      {showNewGroup && (
        <NewGroupModal
          onClose={() => setShowNewGroup(false)}
          onSubmit={handleNewGroup}
        />
      )}
      {groupError && (
        <div className="fixed bottom-4 right-4 z-50 p-3 rounded-lg border border-red-700 bg-red-900/80 text-sm text-red-200">
          {groupError}
        </div>
      )}
    </header>
  );
}
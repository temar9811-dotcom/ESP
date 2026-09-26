// File: ui/src/components/Topbar.jsx | Version: 1.6
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useVersion, useRefreshState, eveApi } from '../hooks/useEveApi';
import AddCharacterModal from './modals/AddCharacterModal';
import NewGroupModal from './modals/NewGroupModal';

const UPDATE_STATUS_TEXT = {
  downloading: 'Downloading update...',
  available: 'Update available!',
  error: 'Update failed',
  unavailable: 'Updates unavailable in this build',
  current: "You're up to date"
};

export default function Topbar({ onOpenSettings, isSettingsOpen }) {
  const version = useVersion();
  const { refreshing } = useRefreshState();
  const [showAdd, setShowAdd] = useState(false);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [groupError, setGroupError] = useState('');
  const [anyEligible, setAnyEligible] = useState(false);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [autoInstall, setAutoInstall] = useState(true);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const statusTimer = useRef(null);
  const userFired = useRef(false);

  const showUpdateStatus = useCallback((state) => {
    // The updater checks hourly on its own; only report what the user triggered.
    if (!userFired.current) return;
    if (!UPDATE_STATUS_TEXT[state]) return;
    setUpdateStatus(state);
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => {
      userFired.current = false;
      setUpdateStatus(null);
    }, 6000);
  }, []);

  const refreshEligibility = useCallback(async () => {
    try {
      const list = await eveApi.getPullerEligibility();
      const ready = (list || []).filter((p) => p.eligible);
      setEligibleCount(ready.length);
      setAnyEligible(ready.length > 0);
    } catch {
      setAnyEligible(false);
    }
  }, []);

  const refreshUpdaterStatus = useCallback(async () => {
    try {
      const res = await eveApi.getUpdaterStatus();
      setAutoInstall(res?.autoInstall !== false);
      setUpdateAvailable(Boolean(res?.available));
    } catch {
      setAutoInstall(true);
      setUpdateAvailable(false);
    }
  }, []);

  useEffect(() => {
    refreshEligibility();
    refreshUpdaterStatus();
    const t = setInterval(() => {
      refreshEligibility();
      refreshUpdaterStatus();
    }, 15000);
    return () => clearInterval(t);
  }, [refreshEligibility, refreshUpdaterStatus]);

  useEffect(() => {
    if (!eveApi.onUpdateStatus) return undefined;
    const unsub = eveApi.onUpdateStatus((p) => {
      if (typeof p?.autoInstall === 'boolean') setAutoInstall(p.autoInstall);
      if (typeof p?.available === 'boolean') setUpdateAvailable(p.available);
      showUpdateStatus(p?.state);
    });
    return unsub;
  }, [showUpdateStatus]);

  const handleUpdateNow = async () => {
    userFired.current = true;
    setUpdateStatus('downloading');
    try {
      await eveApi.fireUpdaterNow();
    } catch (err) {
      console.error(err);
      setUpdateStatus('error');
    }
  };

  const handleRefresh = async () => {
    setBusy(true);
    try {
      const res = await eveApi.requeueEligible();
      if (res && !res.anyEligible) {
        setEligibleCount(0);
        setAnyEligible(false);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setBusy(false);
      refreshEligibility();
    }
  };

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

  const canRefresh = !refreshing && !busy && anyEligible;

  return (
    <header className="flex items-center justify-between border-b border-gray-700 bg-gray-800 px-4 py-3">
      <div className="flex items-center gap-3">
        <h1 className="text-lg font-bold text-blue-400">ESP</h1>
        <span className="text-xs text-gray-400">v{version}</span>
      </div>
      <div className="flex gap-2">
        {updateAvailable && !autoInstall && (
          <button
            onClick={handleUpdateNow}
            title="A new version is available — download and install now"
            className="rounded bg-purple-700 px-3 py-1 text-sm font-medium text-white hover:bg-purple-600"
          >
            Update Now
          </button>
        )}
        {updateStatus && (
          <span className="self-center text-xs text-gray-400">{UPDATE_STATUS_TEXT[updateStatus] || ''}</span>
        )}
        <button
          onClick={handleRefresh}
          disabled={!canRefresh}
          title={anyEligible ? `Ready: ${eligibleCount} puller${eligibleCount === 1 ? '' : 's'} past 50% of their timer` : 'No puller has passed 50% of its timer yet'}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy || refreshing ? 'Refreshing...' : 'Refresh'}
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
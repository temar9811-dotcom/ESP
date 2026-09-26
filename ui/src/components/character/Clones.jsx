// ui/src/components/character/Clones.jsx | Version: 1.5
import React, { useState, useEffect } from 'react';
import { useCharacterSnapshot } from '../../hooks/useEveApi';
import { formatTime } from '../../utils/format';

function NicknameField({ characterId, locationId, value }) {
  const [draft, setDraft] = useState(value || '');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    setDraft(value || '');
  }, [value]);

  const save = async (next) => {
    setSaving(true);
    try {
      await window.eveApi.setCloneNickname(characterId, locationId, next);
      setDraft(next);
      setEditing(false);
    } catch (err) {
      console.error('Failed to save clone nickname:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        title="Set nickname"
        className="text-xs text-gray-500 hover:text-blue-400 px-1 shrink-0"
      >
        ✎
      </button>
    );
  }

  return (
    <span className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
      <input
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save(draft.trim());
          if (e.key === 'Escape') { setDraft(value || ''); setEditing(false); }
        }}
        placeholder="Nickname..."
        maxLength={64}
        className="w-28 bg-gray-900 text-gray-200 px-2 py-0.5 rounded border border-gray-600 focus:outline-none focus:border-blue-500 text-xs"
      />
      <button
        onClick={() => save(draft.trim())}
        disabled={saving}
        className="text-xs bg-green-700 hover:bg-green-600 text-white px-1.5 py-0.5 rounded disabled:opacity-50"
      >
        {saving ? '...' : '✓'}
      </button>
      <button
        onClick={() => { setDraft(value || ''); setEditing(false); }}
        className="text-xs bg-gray-600 hover:bg-gray-500 text-white px-1.5 py-0.5 rounded"
      >
        ✕
      </button>
    </span>
  );
}

function displayName(clone) {
  return clone.nickname ? `${clone.nickname} (${clone.type} - ${clone.name})` : `${clone.type} - ${clone.name}`;
}

export default function Clones({ account }) {
  const snapshot = useCharacterSnapshot(account?.characterId);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (!snapshot?.clones) return <div className="p-4 text-gray-400">Loading clones...</div>;

  const clones = snapshot.clones;
  const home = clones.home;
  const jumpClones = clones.jumpClones || [];
  const charId = account.characterId;

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Home Station</h2>
        <div className="flex items-center justify-between gap-2">
          <p className="text-gray-300 truncate">
            <span className="clone-structure-name">
              {home
                ? (home.nickname
                  ? `${home.nickname} (${home.type} - ${home.name})`
                  : `${home.type} - ${home.name}`)
                : 'Unknown Location'}
            </span>
          </p>
          {home && <NicknameField characterId={charId} locationId={home.location_id} value={home.nickname} />}
        </div>
        {clones.last_station_change_date && <p className="text-xs text-gray-500 mt-2">Last changed: {formatTime(clones.last_station_change_date)}</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Jump Clones ({jumpClones.length})</h2>
        {jumpClones.length === 0 ? <p className="text-gray-500 italic">No jump clones installed.</p> : (
          <div className="space-y-2">
            {jumpClones.map((clone, idx) => (
              <details key={clone.location_id ?? idx} className="group bg-gray-700 rounded-lg">
                <summary className="cursor-pointer p-3 text-sm font-medium text-blue-400 hover:text-blue-300 list-none flex justify-between items-center gap-2">
                  <span className="clone-structure-name truncate">{displayName(clone)}</span>
                  <span className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-gray-400">{clone.implants.length} Implants</span>
                    <NicknameField characterId={charId} locationId={clone.location_id} value={clone.nickname} />
                  </span>
                </summary>
                <div className="px-3 pb-3 space-y-1">
                  {clone.implants.length > 0 ? clone.implants.map((implantName, iIdx) => (
                    <div key={iIdx} className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">
                      {implantName}
                    </div>
                  )) : <p className="text-xs text-gray-500 italic">No implants installed.</p>}
                </div>
              </details>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

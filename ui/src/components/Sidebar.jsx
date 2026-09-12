// File: ui/src/components/Sidebar.jsx | Version: 1.0
import React, { useEffect, useState } from 'react';
import { useAccounts, eveApi } from '../hooks/useEveApi';

export default function Sidebar({ selectedId, onSelect }) {
  const initialAccounts = useAccounts();
  const [accounts, setAccounts] = useState(initialAccounts);

  useEffect(() => {
    setAccounts(initialAccounts);
  }, [initialAccounts]);

  useEffect(() => {
    const unsub = window.eveApi.onAccountsUpdated((updatedAccounts) => {
      setAccounts(updatedAccounts || []);
    });
    return () => unsub();
  }, []);

  const handleRemove = async (id, isTest) => {
    if (isTest) {
      if (window.confirm('Remove all test pilots?')) {
        await eveApi.testRun('pilots.remove', {});
      }
    } else {
      if (window.confirm('Remove this character?')) {
        await eveApi.removeAccount(id);
      }
    }
  };

  return (
    <aside className="w-64 border-r border-gray-700 bg-gray-800 p-4 overflow-y-auto flex flex-col gap-2">
      <h2 className="text-xs font-bold uppercase text-gray-400 mb-2">Characters</h2>
      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">No characters added.</p>
      ) : (
        accounts.map((acc) => (
          <div
            key={acc.characterId}
            onClick={() => onSelect(acc.characterId)}
            className={`p-2 rounded cursor-pointer flex justify-between items-center ${
              selectedId === acc.characterId ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
            }`}
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-white truncate">{acc.characterName}</p>
              <p className="text-xs text-gray-400 truncate">
                {acc.activeSkill ? `Training: ${acc.activeSkill.skillName}` : 'Idle'}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleRemove(acc.characterId, acc.testPilot); }}
              className="text-gray-400 hover:text-red-400 ml-2"
            >
              ✕
            </button>
          </div>
        ))
      )}
    </aside>
  );
}
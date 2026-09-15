// File: ui/src/components/Sidebar.jsx | Version: 1.6
import React from 'react';
import { useAccounts, eveApi } from '../hooks/useEveApi';

export default function Sidebar({ selectedAccount, onSelect }) {
  const accounts = useAccounts();

  const handleRemove = async (id, isTest) => {
    try {
      if (isTest) {
        if (window.confirm('Remove all test pilots?')) {
          await eveApi.testRun('pilots.remove', {});
        }
      } else if (window.confirm('Remove this character?')) {
        await eveApi.removeAccount(id);
      }
    } catch (err) {
      window.eveApi?.debugLog?.({
        level: 'ERROR',
        source: 'SIDEBAR',
        message: 'Failed to remove character',
        data: { error: err?.message || String(err), characterId: id, isTest: Boolean(isTest) }
      });
    }
  };

  return (
    <aside className="w-72 min-[1350px]:w-[32rem] border-r border-gray-700 bg-gray-800 p-4 overflow-y-auto">
      <h2 className="text-xs font-bold uppercase text-gray-400 mb-3">Characters</h2>

      {accounts.length === 0 ? (
        <p className="text-sm text-gray-500">No characters added.</p>
      ) : (
        <div className="grid grid-cols-1 min-[1350px]:grid-cols-2 gap-2">
          {accounts.map((acc) => (
            <div
              key={acc.characterId}
              onClick={() => onSelect(acc)}
              title={acc.characterName}
              className={`min-w-0 w-full p-3 rounded-lg cursor-pointer flex flex-col overflow-hidden border ${
                selectedAccount?.characterId === acc.characterId
                  ? 'bg-blue-600 border-blue-500'
                  : 'bg-gray-700 border-gray-600 hover:bg-gray-600'
              }`}
            >
              <div className="flex justify-between items-start gap-2 min-w-0">
                <p className="flex-1 min-w-0 text-sm font-medium text-white break-words leading-snug overflow-hidden">
                  {acc.characterName}
                </p>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(acc.characterId, acc.testPilot);
                  }}
                  className="text-gray-400 hover:text-red-400 shrink-0 text-sm px-1"
                  title={acc.testPilot ? 'Remove test pilots' : 'Remove character'}
                >
                  ✕
                </button>
              </div>

              <p
                className="text-xs text-gray-300 break-words mt-1 leading-snug min-w-0 overflow-hidden"
                title={acc.activeSkill?.skillName || 'Idle'}
              >
                {acc.activeSkill ? acc.activeSkill.skillName : 'Idle'}
              </p>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}
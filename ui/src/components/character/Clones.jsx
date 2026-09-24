// ui/src/components/character/Clones.jsx | Version: 1.4
import React from 'react';
import { useCharacterSnapshot } from '../../hooks/useEveApi';
import { formatTime } from '../../utils/format';

export default function Clones({ account }) {
  const snapshot = useCharacterSnapshot(account?.characterId);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (!snapshot?.clones) return <div className="p-4 text-gray-400">Loading clones...</div>;

  const clones = snapshot.clones;
  const home = clones.home;
  const jumpClones = clones.jumpClones || [];

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Home Station</h2>
        <p className="text-gray-300"><span className="clone-structure-name">{home ? `${home.type} - ${home.name}` : 'Unknown Location'}</span></p>
        {clones.last_station_change_date && <p className="text-xs text-gray-500 mt-2">Last changed: {formatTime(clones.last_station_change_date)}</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Jump Clones ({jumpClones.length})</h2>
        {jumpClones.length === 0 ? <p className="text-gray-500 italic">No jump clones installed.</p> : (
          <div className="space-y-2">
            {jumpClones.map((clone, idx) => (
              <details key={idx} className="group bg-gray-700 rounded-lg">
                <summary className="cursor-pointer p-3 text-sm font-medium text-blue-400 hover:text-blue-300 list-none flex justify-between items-center">
                  <span className="clone-structure-name">{clone.type} - {clone.name}</span>
                  <span className="text-xs text-gray-400">{clone.implants.length} Implants</span>
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
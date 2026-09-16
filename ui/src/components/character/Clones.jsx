// ui/src/components/character/Clones.jsx | Version: 1.2
import React, { useState, useEffect } from 'react';

export default function Clones({ account }) {
  const [clonesData, setClonesData] = useState(null);
  const [universeNames, setUniverseNames] = useState({});
  const [structureNames, setStructureNames] = useState({});

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [clData, uNames, sNames] = await Promise.all([
          window.eveApi.getClonesData(account.characterId),
          window.eveApi.getUniverseNames(),
          window.eveApi.getStructureNames()
        ]);
        if (isMounted) {
          setClonesData(clData);
          setUniverseNames(uNames || {});
          setStructureNames(sNames || {});
        }
      } catch (err) { 
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'CLONES-UI', message: 'Failed to load', data: { error: err?.message } }); 
      }
    };
    if (account?.characterId) fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (!clonesData) return <div className="p-4 text-gray-400">Loading clones...</div>;

  const getLocName = (id, type) => {
    if (type === 'structure') return structureNames[id]?.name || `Structure ${id}`;
    return universeNames[id] || 'Unknown Location';
  };

  const homeLoc = clonesData.home_location;
  const homeName = getLocName(homeLoc?.location_id, homeLoc?.location_type);
  const homeTypeLabel = homeLoc?.location_type === 'structure' ? 'Citadel' : 'Station';
  const jumpClones = clonesData.jump_clones || [];

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Home Station</h2>
        <p className="text-gray-300">{homeTypeLabel} - {homeName}</p>
        {clonesData.last_station_change_date && <p className="text-xs text-gray-500 mt-2">Last changed: {new Date(clonesData.last_station_change_date).toLocaleString()}</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Jump Clones ({jumpClones.length})</h2>
        {jumpClones.length === 0 ? <p className="text-gray-500 italic">No jump clones installed.</p> : (
          <div className="space-y-2">
            {jumpClones.map((clone, idx) => {
              const cloneName = getLocName(clone.location_id, clone.location_type);
              const cloneTypeLabel = clone.location_type === 'structure' ? 'Citadel' : 'Station';
              const implants = clone.implant || [];
              return (
                <details key={idx} className="group bg-gray-700 rounded-lg">
                  <summary className="cursor-pointer p-3 text-sm font-medium text-blue-400 hover:text-blue-300 list-none flex justify-between items-center">
                    <span>{cloneTypeLabel} - {cloneName}</span>
                    <span className="text-xs text-gray-400">{implants.length} Implants</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-1">
                    {implants.length > 0 ? implants.map((implantId, iIdx) => (
                      <div key={iIdx} className="text-xs text-gray-300 bg-gray-800 px-2 py-1 rounded">
                        {universeNames[implantId] || `Implant ${implantId}`}
                      </div>
                    )) : <p className="text-xs text-gray-500 italic">No implants installed.</p>}
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
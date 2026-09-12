// File: ui/src/components/character/Clones.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function Clones({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [clones, setClones] = useState(null);
  const [nicknames, setNicknames] = useState({});
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [cloneData, nickData] = await Promise.all([
          window.eveApi.getCloneDetails(characterId),
          window.eveApi.getAllCloneNicknames()
        ]);
        if (isMounted) {
          setClones(cloneData);
          setNicknames(nickData || {});
        }
      } catch (err) {
        console.error('Failed to load clones:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [characterId]);

  const saveNickname = async (cloneId) => {
    await window.eveApi.setCloneNickname(cloneId, editValue);
    setNicknames(prev => ({ ...prev, [cloneId]: editValue }));
    setEditingId(null);
  };

  if (loading) return <div className="p-4 text-gray-400">Loading clones...</div>;

  const jumpClones = clones?.jump_clones || [];
  const homeStation = clones?.home_location_id;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Home Station</h2>
        <p className="text-gray-300">{homeStation ? `Location ID: ${homeStation}` : 'Unknown'}</p>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Jump Clones ({jumpClones.length})</h2>
        <div className="space-y-3">
          {jumpClones.length === 0 ? (
            <p className="text-gray-500 italic">No jump clones.</p>
          ) : (
            jumpClones.map((clone) => (
              <div key={clone.clone_id} className="bg-gray-700 p-3 rounded">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium text-gray-200">Clone ID: {clone.clone_id}</span>
                  <div className="text-xs text-gray-400">
                    {editingId === clone.clone_id ? (
                      <div className="flex gap-1">
                        <input type="text" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="bg-gray-800 text-xs px-1 py-0.5 rounded" />
                        <button onClick={() => saveNickname(clone.clone_id)} className="text-green-400">Save</button>
                        <button onClick={() => setEditingId(null)} className="text-red-400">X</button>
                      </div>
                    ) : (
                      <button onClick={() => { setEditingId(clone.clone_id); setEditValue(nicknames[clone.clone_id] || ''); }}>
                        {nicknames[clone.clone_id] || 'Set Nickname'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-xs text-gray-400">Implants: {clone.implants?.length || 0}</div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
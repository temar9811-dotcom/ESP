// File: ui/src/components/character/Assets.jsx | Version: 1.2
import React, { useState, useEffect } from 'react';

export default function Assets({ account }) {
  const [loading, setLoading] = useState(true);
  const [isCorp, setIsCorp] = useState(false);
  const [assets, setAssets] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchAssets = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        const data = isCorp 
          ? await window.eveApi.getCorpAssets(id)
          : await window.eveApi.getPersonalAssets(id);
        
        if (isMounted) {
          const safeAssets = Array.isArray(data) ? data : (data?.assets || []);
          setAssets(safeAssets);
        }
      } catch (err) {
        console.error('Failed to load assets:', err);
        if (isMounted) setAssets([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchAssets();
    return () => { isMounted = false; };
  }, [account?.characterId, isCorp]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading assets...</div>;

  const locations = Array.isArray(assets) ? assets.reduce((acc, item) => {
    const loc = item.location_id || 'Unknown';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(item);
    return acc;
  }, {}) : {};

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Assets</h2>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsCorp(false)} 
            className={`px-3 py-1 text-sm rounded ${!isCorp ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
            Personal
          </button>
          <button 
            onClick={() => setIsCorp(true)} 
            className={`px-3 py-1 text-sm rounded ${isCorp ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>
            Corporation
          </button>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
        {Object.keys(locations).length === 0 ? (
          <p className="text-gray-500 italic">No assets found.</p>
        ) : (
          Object.entries(locations).map(([locId, items]) => (
            <details key={locId} className="group">
              <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300">
                Location ID: {locId} ({items.length} items)
              </summary>
              <div className="mt-2 pl-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item, idx) => (
                  <div key={idx} className="text-xs text-gray-300">
                    {item.type_name || 'Unknown Item'} (Qty: {item.quantity || 1})
                  </div>
                ))}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
}
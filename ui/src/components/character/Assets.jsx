// File: ui/src/components/character/Assets.jsx | Version: 1.4
import React, { useState, useEffect } from 'react';
const uiLog = (level, message, data) => { try { window.eveApi?.debugLog?.({ level, source: 'ASSETS-UI', message, data }); } catch {} };
export default function Assets({ account }) {
  const [loading, setLoading] = useState(true);
  const [isCorp, setIsCorp] = useState(false);
  const [assets, setAssets] = useState([]);
  const [names, setNames] = useState(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        uiLog('DEBUG', `Fetching ${isCorp ? 'corp' : 'personal'} assets`, { characterId: id });
        const data = isCorp ? await window.eveApi.getCorpAssets(id) : await window.eveApi.getPersonalAssets(id);
        const safeAssets = Array.isArray(data) ? data : (data?.assets || []);
        uiLog('DEBUG', 'Assets received', { count: safeAssets.length, isCorp });
        if (!isMounted) return;
        setAssets(safeAssets);
        const nameData = await window.eveApi.getAssetNames(id);
        uiLog('DEBUG', 'Asset names received', {
          hasNames: Boolean(nameData),
          pulling: nameData?.pulling,
          items: nameData?.items ? Object.keys(nameData.items).length : 0,
          types: nameData?.types ? Object.keys(nameData.types).length : 0
        });
        if (isMounted) setNames(nameData);
      } catch (err) {
        uiLog('ERROR', 'Failed to load assets', { error: err?.message || String(err), isCorp });
        if (isMounted) setAssets([]);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId, isCorp, reload]);
  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading assets...</div>;
  const locations = Array.isArray(assets) ? assets.reduce((acc, item) => {
    const loc = item.location_id || 'Unknown';
    if (!acc[loc]) acc[loc] = [];
    acc[loc].push(item);
    return acc;
  }, {}) : {};
  const locationLabel = (locId) => {
    const loc = names?.locations?.[locId];
    if (loc?.name) return loc.name;
    const itemName = names?.items?.[locId];
    if (itemName) return itemName;
    return `Location ID: ${locId}`;
  };
  const locationSub = (locId) => {
    const loc = names?.locations?.[locId];
    if (!loc) return null;
    return [loc.systemName, loc.regionName].filter(Boolean).join(' • ');
  };
  const itemLabel = (item) => names?.items?.[item.item_id] || names?.types?.[item.type_id] || item.type_name || item.name || `Type ${item.type_id || item.item_id}`;
  const refreshAssets = async () => {
    uiLog('DEBUG', 'Manual asset refresh requested', { isCorp });
    try {
      await window.eveApi.refreshAssetsNow(account.characterId);
      setReload((n) => n + 1);
    } catch (err) {
      uiLog('ERROR', 'Manual asset refresh failed', { error: err?.message || String(err) });
    }
  };
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Assets</h2>
        <div className="flex gap-2">
          <button onClick={() => setIsCorp(false)} className={`px-3 py-1 text-sm rounded ${!isCorp ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Personal</button>
          <button onClick={() => setIsCorp(true)} className={`px-3 py-1 text-sm rounded ${isCorp ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'}`}>Corporation</button>
          <button onClick={refreshAssets} className="px-3 py-1 text-sm rounded bg-gray-600 text-gray-200 hover:bg-gray-500">Refresh</button>
        </div>
      </div>
      {names?.pulling && <p className="text-xs text-yellow-400">Asset name resolution is still running.</p>}
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-2">
        {Object.keys(locations).length === 0 ? (
          <p className="text-gray-500 italic">No assets found.</p>
        ) : (
          Object.entries(locations).map(([locId, items]) => (
            <details key={locId} className="group">
              <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300">
                <span>{locationLabel(locId)} ({items.length} items)</span>
                {locationSub(locId) && <span className="block text-xs text-gray-500">{locationSub(locId)}</span>}
              </summary>
              <div className="mt-2 pl-4 grid grid-cols-1 md:grid-cols-2 gap-2">
                {items.map((item, idx) => (
                  <div key={idx} className="text-xs text-gray-300">
                    {itemLabel(item)} (Qty: {item.quantity || 1})
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
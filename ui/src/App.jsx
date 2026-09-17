// File: ui/src/components/character/Assets.jsx | Version: 2.0
import React, { useState, useEffect } from 'react';
const uiLog = (level, message, data) => { try { window.eveApi?.debugLog?.({ level, source: 'ASSETS-UI', message, data }); } catch {} };

export default function Assets({ account }) {
  const [loading, setLoading] = useState(true);
  const [treeData, setTreeData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      setError(null);
      try {
        const id = account?.characterId;
        if (!id) { setLoading(false); return; }
        uiLog('DEBUG', 'Fetching asset tree', { characterId: id });
        const data = await window.eveApi.getAssetTree(id);
        if (!isMounted) return;
        if (!data) {
          setTreeData(null);
          uiLog('WARN', 'No tree data returned', { characterId: id });
        } else {
          setTreeData(data);
          uiLog('DEBUG', 'Tree data received', {
            hasTree: Boolean(data.tree),
            unresolvedCount: data.unresolved?.length || 0,
            typeNamesCount: data.typeNames ? Object.keys(data.typeNames).length : 0
          });
        }
      } catch (err) {
        uiLog('ERROR', 'Failed to load asset tree', { error: err?.message || String(err) });
        if (isMounted) setError(err?.message || 'Failed to load assets');
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading assets...</div>;
  if (error) return <div className="p-4 text-red-400">Error: {error}</div>;
  if (!treeData) return <div className="p-4 text-gray-500 italic">No asset data available.</div>;

  const tree = treeData.tree;
  const unresolved = treeData.unresolved || [];
  const typeNames = treeData.typeNames || {};

  const getItemName = (typeId) => typeNames[typeId] || `Type ${typeId}`;

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Assets</h2>
        <div className="text-xs text-gray-500">
          Last updated: {treeData.lastUpdated ? new Date(treeData.lastUpdated).toLocaleString() : 'Never'}
        </div>
      </div>

      {!tree && <div className="text-yellow-400 text-sm">Tree structure not built yet. Data may still be resolving.</div>}

      {tree && Object.keys(tree.regions || {}).length > 0 && (
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-sm font-medium text-blue-400 mb-2">Resolved Locations</h3>
          {Object.entries(tree.regions).map(([regionName, regionData]) => (
            <details key={regionName} className="mb-2">
              <summary className="cursor-pointer text-sm font-medium text-gray-200 hover:text-blue-300">
                🌍 {regionName}
              </summary>
              <div className="ml-4 mt-1">
                {Object.entries(regionData.systems || {}).map(([systemName, systemData]) => (
                  <details key={systemName} className="mb-1">
                    <summary className="cursor-pointer text-xs text-gray-300 hover:text-blue-300">
                      ☀️ {systemName}
                    </summary>
                    <div className="ml-4 mt-1">
                      {Object.entries(systemData.stations || {}).map(([stationName, assets]) => (
                        <details key={stationName} className="mb-1">
                          <summary className="cursor-pointer text-xs text-gray-400 hover:text-blue-300">
                            🏢 {stationName} ({assets.length} items)
                          </summary>
                          <div className="ml-4 mt-1 grid grid-cols-1 md:grid-cols-2 gap-1">
                            {assets.map((asset, idx) => (
                              <div key={idx} className="text-xs text-gray-300">
                                {getItemName(asset.type_id)} (Qty: {asset.quantity || 1})
                              </div>
                            ))}
                          </div>
                        </details>
                      ))}
                    </div>
                  </details>
                ))}
              </div>
            </details>
          ))}
        </div>
      )}

      {unresolved.length > 0 && (
        <div className="bg-gray-800 p-4 rounded-lg border border-yellow-700">
          <h3 className="text-sm font-medium text-yellow-400 mb-2">
            Unresolved Locations ({unresolved.length})
          </h3>
          <div className="text-xs text-gray-400 space-y-1">
            {unresolved.map((loc, idx) => (
              <div key={idx} className="flex justify-between">
                <span>ID: {loc.id}</span>
                <span className="text-gray-500">Type: {loc.type} | Assets: {loc.assetCount}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
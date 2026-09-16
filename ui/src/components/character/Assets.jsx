// ui/src/components/character/Assets.jsx | Version: 3.1
import React, { useState, useEffect } from 'react';

export default function Assets({ account }) {
  const [tree, setTree] = useState({});
  const [missingData, setMissingData] = useState([]);
  const [uNames, setUNames] = useState({});
  const [sNames, setSNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!account?.characterId) return;
      setLoading(true);
      try {
        const [assets, u, s] = await Promise.all([
          window.eveApi.getAssetsData(account.characterId),
          window.eveApi.getUniverseNames(),
          window.eveApi.getStructureNames()
        ]);
        if (!mounted) return;
        setUNames(u || {});
        setSNames(s || {});

        const rawAssets = assets?.assets || [];
        if (rawAssets.length === 0) {
          setTree({});
          setMissingData([]);
          setLoading(false);
          return;
        }

        // Group by unique locations first
        const uniqueLocs = new Map();
        for (const a of rawAssets) {
          if (!uniqueLocs.has(a.location_id)) {
            uniqueLocs.set(a.location_id, { type: a.location_type, items: [] });
          }
          uniqueLocs.get(a.location_id).items.push(a);
        }

        const newTree = {};
        const newMissing = [];

        // Process each unique location
        for (const [locId, data] of uniqueLocs.entries()) {
          try {
            let hierarchy = null;
            let locName = null;

            // Check structure cache first
            if (data.type === 'structure' && sNames[locId]) {
              locName = sNames[locId].name;
              if (sNames[locId].system_id) {
                hierarchy = await window.eveApi.getLocationHierarchy(sNames[locId].system_id);
              }
            } else {
              // Try to get hierarchy from static DB
              hierarchy = await window.eveApi.getLocationHierarchy(locId);
              if (hierarchy) locName = hierarchy.locationName;
            }

            // If we have complete hierarchy, add to tree
            if (hierarchy && hierarchy.regionName && hierarchy.systemName && locName) {
              const r = hierarchy.regionName;
              const sys = hierarchy.systemName;
              if (!newTree[r]) newTree[r] = {};
              if (!newTree[r][sys]) newTree[r][sys] = {};
              if (!newTree[r][sys][locName]) {
                newTree[r][sys][locName] = { type: data.type, items: [] };
              }
              newTree[r][sys][locName].items.push(...data.items);
            } else {
              // Add to missing data
              newMissing.push(...data.items);
            }
          } catch (err) {
            console.error('[ASSETS] Error processing location', locId, err);
            newMissing.push(...data.items);
          }
        }

        setTree(newTree);
        setMissingData(newMissing);
      } catch (err) {
        console.error('[ASSETS-UI] Load failed:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading assets...</div>;

  const getItemName = (typeId) => uNames[typeId] || `Type ${typeId}`;
  const fmtType = (t) => t === 'item' ? 'Inside Container/Ship' : t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());

  const renderTree = (data, isMissing = false) => {
    if (!data || typeof data !== 'object') return null;
    return (
      <div className="space-y-2">
        {Object.entries(data).map(([key, children]) => (
          <details key={key} className="bg-gray-800 rounded-lg border border-gray-700" open={isMissing}>
            <summary className="cursor-pointer p-3 text-sm font-medium text-blue-400 hover:text-blue-300">
              {key}
            </summary>
            <div className="px-3 pb-3 space-y-3">
              {typeof children === 'object' && !Array.isArray(children) ? (
                renderTree(children, isMissing)
              ) : (
                <div>
                  <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">{fmtType(children.type)}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
                    {children.items && children.items.map((item, idx) => (
                      <div key={idx} className="text-xs text-gray-300 flex justify-between bg-gray-700 px-2 py-1 rounded">
                        <span className="truncate mr-2">{getItemName(item.type_id)}</span>
                        <span className="text-gray-400 shrink-0">x{item.quantity}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </details>
        ))}
      </div>
    );
  };

  const totalRegions = Object.keys(tree).length;
  const totalMissing = missingData.length;

  return (
    <div className="space-y-4 p-4">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Assets</h2>
        <div className="text-sm text-gray-400">
          <span className="mr-4">Regions: {totalRegions}</span>
          {totalMissing > 0 && <span className="text-yellow-400">Missing: {totalMissing}</span>}
        </div>
      </div>
      {totalRegions === 0 && totalMissing === 0 ? (
        <p className="text-gray-500 italic">No assets found.</p>
      ) : (
        <>
          {renderTree(tree)}
          {totalMissing > 0 && (
            <details className="bg-red-900/20 rounded-lg border border-red-800" open>
              <summary className="cursor-pointer p-3 text-sm font-medium text-red-400 hover:text-red-300">
                Missing Data ({totalMissing} items)
              </summary>
              <div className="px-3 pb-3 space-y-3">
                {renderTree({ 'Unknown': { 'Unknown': { 'Unresolvable ID': { type: 'item', items: missingData } } } }, true)}
              </div>
            </details>
          )}
        </>
      )}
    </div>
  );
}
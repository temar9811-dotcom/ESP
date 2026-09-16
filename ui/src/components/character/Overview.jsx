// ui/src/components/character/Overview.jsx
// VERSION: 1.8
import React, { useState, useEffect } from 'react';

function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const s = Math.floor(ms / 1000);
  const d = Math.floor((s % 86400) / 3600), h = Math.floor((s % 3600) / 60), m = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`); if (h > 0) parts.push(`${h}h`); if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

function calculateSkillProgress(activeSkill) {
  if (!activeSkill) return 0;
  const now = Date.now();
  const start = activeSkill.start_date ? new Date(activeSkill.start_date).getTime() : 0;
  const finish = activeSkill.finish_date ? new Date(activeSkill.finish_date).getTime() : 0;
  if (!start || !finish || finish <= start) return 0;
  if (now >= finish) return 100;
  if (now <= start) return 0;
  return Math.min(100, Math.max(0, ((now - start) / (finish - start)) * 100));
}

export default function Overview({ account }) {
  const [charData, setCharData] = useState(null);
  const [corpAllianceData, setCorpAllianceData] = useState({});
  const [skillsData, setSkillsData] = useState(null);
  const [walletData, setWalletData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const id = account.characterId;
        const [cData, caData, sData, wData] = await Promise.all([
          window.eveApi.getCharData(id),
          window.eveApi.getCorpAllianceData(),
          window.eveApi.getSkillsData(id),
          window.eveApi.getWalletData(id)
        ]);
        if (isMounted) {
          setCharData(cData);
          setCorpAllianceData(caData || {});
          setSkillsData(sData);
          setWalletData(wData);
        }
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'OVERVIEW', message: 'Failed to load data', data: { error: err?.message } });
      }
    };
    if (account?.characterId) fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;

  // Use new V2 caches, fallback to legacy account data
  const activeSkill = skillsData?.queue?.[0] || account.activeSkill;
  const queueLength = skillsData?.queue?.length || account.queue?.length || 0;
  const walletBalance = Number(walletData?.balance ?? account.wallet ?? 0);
  const queueRemainingMs = account.queueRemainingMs || 0;
  
  const systemName = charData?.system_name || `System ${charData?.location?.solar_system_id || 'Unknown'}`;
  const corpName = corpAllianceData[charData?.corporation_id] || `Corp ${charData?.corporation_id || 'Unknown'}`;
  const allianceName = corpAllianceData[charData?.alliance_id] || (charData?.alliance_id ? `Alliance ${charData.alliance_id}` : 'No Alliance');
  const shipName = account.shipName || 'Unknown';
  const shipType = account.shipType || null;
  const progress = calculateSkillProgress(activeSkill);

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Active Skill</h2>
        <p className="text-gray-300">{activeSkill ? `${activeSkill.skill_name || activeSkill.skillName} (${progress.toFixed(1)}%)` : 'No active skill'}</p>
        <div className="w-full bg-gray-700 rounded-full h-2.5 mt-3 overflow-hidden">
          <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Queue length: {queueLength} skills
          {queueRemainingMs > 0 && ` • Completes in: ${formatQueueTime(queueRemainingMs)}`}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Wallet Balance</h2>
          <p className="text-2xl font-mono text-green-400">{walletBalance.toLocaleString()} ISK</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Corporation</h2>
          <p className="text-gray-300">{corpName}</p>
          <p className="text-sm text-gray-400">{allianceName}</p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Location & Ship</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Location</p>
            <p className="text-gray-300">{systemName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Ship</p>
            <p className="text-gray-300">{shipName}</p>
            {shipType && <p className="text-xs text-gray-400">{shipType}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
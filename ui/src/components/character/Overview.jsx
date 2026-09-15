// File: ui/src/components/character/Overview.jsx | Version: 1.8
import React, { useState, useEffect } from 'react';

function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor((totalSeconds % (24 * 3600)) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes}m`);
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
  const [corp, setCorp] = useState(null);
  const [skillsData, setSkillsData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const corpData = await window.eveApi.getCorpInfo(account.characterId);
        if (isMounted) setCorp(corpData);
        if (window.eveApi.getSkillsData) {
          const sData = await window.eveApi.getSkillsData(account.characterId);
          if (isMounted) setSkillsData(sData);
        }
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'OVERVIEW', message: 'Failed to load overview data', data: { error: err?.message } });
      }
    };
    if (account?.characterId) fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;

  const activeSkill = account.activeSkill;
  const queueLength = account.queue?.length || 0;
  const walletBalance = Number(account.wallet || 0);
  const queueRemainingMs = account.queueRemainingMs || 0;
  const location = account.location || null;
  const shipName = account.shipName || null;
  const shipType = account.shipType || null;
  const corpName = corp?.corporation || 'Unknown';
  const allianceName = corp?.alliance || 'No Alliance';
  const progress = calculateSkillProgress(activeSkill);
  const totalSp = skillsData?.total_sp || 0;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Active Skill</h2>
        <p className="text-gray-300">{activeSkill ? `${activeSkill.skillName} (${progress.toFixed(1)}%)` : 'No active skill'}</p>
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
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Total Skill Points</h2>
          <p className="text-2xl font-mono text-blue-400">{totalSp.toLocaleString()} SP</p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Corporation & Location</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Corp / Alliance</p>
            <p className="text-gray-300">{corpName}</p>
            <p className="text-sm text-gray-400">{allianceName}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Location</p>
            <p className="text-gray-300">{location || 'Unknown'}</p>
            {shipName && <p className="text-xs text-gray-400 mt-1">Ship: {shipName} {shipType ? `(${shipType})` : ''}</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
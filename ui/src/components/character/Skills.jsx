// File: ui/src/components/character/Skills.jsx | Version: 1.5
import React, { useState, useEffect } from 'react';

function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const s = Math.floor(ms / 1000);
  const y = Math.floor(s / 31536000), mo = Math.floor((s % 31536000) / 2592000), d = Math.floor((s % 2592000) / 86400);
  const h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (y > 0) parts.push(`${y}y`); if (mo > 0) parts.push(`${mo}mo`); if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`); if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export default function Skills({ account }) {
  const [loading, setLoading] = useState(true);
  const [groupedSkills, setGroupedSkills] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSkills = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        const data = await window.eveApi.getCharacterSkills(id);
        if (isMounted) setGroupedSkills(data);
      } catch (err) {
        console.error('Failed to load skills:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSkills();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;

  const queue = account.queue || [];
  const totalSp = account.totalSp || 0;
  const queueRemainingMs = account.queueRemainingMs || 0;

  if (loading) return <div className="p-4 text-gray-400">Loading skills...</div>;
  const groups = groupedSkills?.groups || [];
  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Skill Queue ({queue.length})</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {queue.length === 0 ? (
            <p className="text-gray-500 italic">Queue is empty.</p>
          ) : (
            queue.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                <span className="text-sm text-gray-200">{item.skillName} (Lvl {item.finished_level})</span>
                <span className="text-xs text-gray-400">{new Date(item.finish_date).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
        {queueRemainingMs > 0 && (
          <p className="text-xs text-gray-400 mt-2">
            Queue completes in: {formatQueueTime(queueRemainingMs)}
          </p>
        )}
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Total Skill Points</h2>
        <p className="text-2xl font-mono text-blue-400">{Number(totalSp).toLocaleString()} SP</p>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Trained Skills</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.length === 0 ? (
            <p className="text-gray-500 italic col-span-full">No skills data available.</p>
          ) : (
            groups.map((group) => (
              <details key={group.id} className="group">
                <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300">
                  {group.name} ({group.skills.length})
                </summary>
                <div className="mt-2 pl-4 space-y-1">
                  {group.skills.map((skill) => (
                    <div key={skill.id} className="text-xs text-gray-300">
                      {skill.name} - Lvl {skill.level}
                      {skill.sp > 0 && <span className="text-gray-500 ml-1">({skill.sp.toLocaleString()} SP)</span>}
                    </div>
                  ))}
                </div>
              </details>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
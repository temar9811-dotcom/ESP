// ui/src/components/character/Skills.jsx
// VERSION: 1.7
import React, { useState, useEffect } from 'react';
import { useAccounts } from '../../hooks/useEveApi';

function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const s = Math.floor(ms / 1000);
  const d = Math.floor((s % 2592000) / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`); if (h > 0) parts.push(`${h}h`); if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

export default function Skills({ account }) {
  const accounts = useAccounts();
  const [loading, setLoading] = useState(true);
  const [skillsData, setSkillsData] = useState(null);
  const [ignoreNoTraining, setIgnoreNoTraining] = useState(false);

  const liveAccount = Array.isArray(accounts)
    ? accounts.find((a) => Number(a.characterId) === Number(account?.characterId)) || account
    : account;

  useEffect(() => {
    setIgnoreNoTraining(Boolean(liveAccount?.ignoreNoTraining));
  }, [liveAccount?.characterId, liveAccount?.ignoreNoTraining]);

  const handleIgnoreNoTraining = async (checked) => {
    setIgnoreNoTraining(checked);
    try {
      if (window.eveApi.setIgnoreNoTraining) {
        await window.eveApi.setIgnoreNoTraining(account.characterId, checked);
      }
    } catch (err) {
      setIgnoreNoTraining(Boolean(liveAccount?.ignoreNoTraining));
      window.eveApi?.debugLog?.({ level: 'ERROR', source: 'SKILLS-UI', message: 'Failed to update ignoreNoTraining', data: { error: err?.message } });
    }
  };

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        if (window.eveApi.getSkillsData) {
          const sData = await window.eveApi.getSkillsData(id);
          if (isMounted) setSkillsData(sData);
        }
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'SKILLS-UI', message: 'Failed to load skills', data: { error: err?.message } });
      } finally { if (isMounted) setLoading(false); }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading skills...</div>;

  const queue = skillsData?.queue || [];
  const totalSp = skillsData?.total_sp || 0;
  const queueRemainingMs = account.queueRemainingMs || 0;
  
  // Group trained skills by group_name
  const groupedSkills = {};
  (skillsData?.skills || []).forEach(s => {
    const group = s.group_name || 'Unknown';
    if (!groupedSkills[group]) groupedSkills[group] = [];
    groupedSkills[group].push(s);
  });
  const groups = Object.entries(groupedSkills).sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div className="space-y-6">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <label className="flex items-center justify-between text-gray-300 cursor-pointer select-none">
          <span>Ignore no-skill-training (suppress notification and red pulse)</span>
          <input type="checkbox" checked={ignoreNoTraining} onChange={(e) => handleIgnoreNoTraining(e.target.checked)} className="w-4 h-4" />
        </label>
        <p className="text-xs text-gray-500 mt-1">While enabled, this character will not show a red alert pulse or ping when its skill queue is empty.</p>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Skill Queue ({queue.length})</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {queue.length === 0 ? <p className="text-gray-500 italic">Queue is empty.</p> : queue.map((item, idx) => (
            <div key={idx} className="flex justify-between items-center bg-gray-700 p-2 rounded">
              <span className="text-sm text-gray-200">{item.skill_name} (Lvl {item.finished_level})</span>
              <span className="text-xs text-gray-400">{new Date(item.finish_date).toLocaleString()}</span>
            </div>
          ))}
        </div>
        {queueRemainingMs > 0 && <p className="text-xs text-gray-400 mt-2">Queue completes in: {formatQueueTime(queueRemainingMs)}</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Total Skill Points</h2>
        <p className="text-2xl font-mono text-blue-400">{Number(totalSp).toLocaleString()} SP</p>
        {skillsData?.fetchedAt && <p className="text-xs text-gray-500 mt-2">Updated: {new Date(skillsData.fetchedAt).toLocaleString()}</p>}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Trained Skills</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {groups.length === 0 ? <p className="text-gray-500 italic col-span-full">No skills data available.</p> : groups.map(([groupName, skills]) => (
            <details key={groupName} className="group">
              <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300 trained-skills-branch">{groupName} ({skills.length})</summary>
              <div className="mt-2 pl-4 space-y-1">
                {skills.map((skill) => (
                  <div key={skill.skill_id} className="text-xs text-gray-300 trained-skills-leaf">
                    {skill.skill_name} - Lvl {skill.trained_skill_level}
                    {skill.skillpoints_in_skill > 0 && <span className="text-gray-500 ml-1">({skill.skillpoints_in_skill.toLocaleString()} SP)</span>}
                  </div>
                ))}
              </div>
            </details>
          ))}
        </div>
      </div>
    </div>
  );
}
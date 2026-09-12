// File: ui/src/components/character/Skills.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function Skills({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchSkills = async () => {
      setLoading(true);
      try {
        const data = await window.eveApi.getCharacterSkills(characterId);
        if (isMounted) setSkills(data);
      } catch (err) {
        console.error('Failed to load skills:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchSkills();
    return () => { isMounted = false; };
  }, [characterId]);

  if (loading) return <div className="p-4 text-gray-400">Loading skills...</div>;

  const queue = skills?.queue || [];
  const trained = skills?.skills || [];
  
  const groupedSkills = trained.reduce((acc, skill) => {
    const group = skill.group_name || 'Uncategorized';
    if (!acc[group]) acc[group] = [];
    acc[group].push(skill);
    return acc;
  }, {});

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Skill Queue ({queue.length})</h2>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {queue.length === 0 ? (
            <p className="text-gray-500 italic">Queue is empty.</p>
          ) : (
            queue.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center bg-gray-700 p-2 rounded">
                <span className="text-sm text-gray-200">{item.name} (Lvl {item.level})</span>
                <span className="text-xs text-gray-400">{new Date(item.finish_date).toLocaleString()}</span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-3">Trained Skills</h2>
        <div className="space-y-4">
          {Object.keys(groupedSkills).map((group) => (
            <details key={group} className="group">
              <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300">
                {group} ({groupedSkills[group].length})
              </summary>
              <div className="mt-2 pl-4 grid grid-cols-2 gap-2">
                {groupedSkills[group].map((skill) => (
                  <div key={skill.skill_id} className="text-xs text-gray-300">
                    {skill.name} - Lvl {skill.trained_level}
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
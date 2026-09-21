// File: ui/src/components/character/CreatePlan.jsx | Version: 1.3
import React, { useState, useEffect, useMemo } from 'react';

const MAX_LEVEL = 5;

const entriesFromPlan = (plan) => {
  const map = new Map();
  (Array.isArray(plan?.entries) ? plan.entries : []).forEach((entry) => {
    const level = Math.min(MAX_LEVEL, Math.max(1, Number(entry?.level) || 1));
    map.set(entry?.skillId ?? `__name__${entry?.name ?? ''}`, {
      skillId: entry?.skillId ?? null,
      name: entry?.name || 'Unknown',
      level
    });
  });
  return map;
};

export default function CreatePlan({ account, onClose, editingPlan }) {
  const isEditing = Boolean(editingPlan);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [skillLevels, setSkillLevels] = useState({});
  const [name, setName] = useState(isEditing ? editingPlan.name || '' : '');
  const [scope, setScope] = useState(isEditing && editingPlan.scope === 'character' ? 'character' : 'global');
  const [entries, setEntries] = useState(() => entriesFromPlan(editingPlan));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const all = await window.eveApi.getAllSkills();
        if (isMounted) setCatalog(Array.isArray(all) ? all : null);
      } catch (err) {
        if (isMounted) setCatalogError(err?.message || String(err));
      }
    })();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const id = account?.characterId;
    if (!id) return;
    window.eveApi.getSkillsData(id)
      .then((data) => {
        if (!isMounted) return;
        const map = {};
        (data?.skills || []).forEach((s) => { map[s.skill_id] = s.trained_skill_level; });
        setSkillLevels(map);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [account?.characterId]);

  const groups = useMemo(() => {
    if (!catalog) return [];
    const grouped = {};
    catalog.forEach((s) => {
      const g = s.groupName || 'Unknown';
      if (!grouped[g]) grouped[g] = [];
      grouped[g].push(s);
    });
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0]));
  }, [catalog]);

  const addSkill = (skill) => {
    setSaveError('');
    setEntries((prev) => {
      const next = new Map(prev);
      const existing = next.get(skill.id);
      const level = Math.min(MAX_LEVEL, (existing?.level || 0) + 1);
      next.set(skill.id, { skillId: Number(skill.id), name: skill.name, level });
      return next;
    });
  };

  const decreaseSkill = (entry) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const level = entry.level - 1;
      if (level <= 0) next.delete(entry.skillId);
      else next.set(entry.skillId, { ...entry, level });
      return next;
    });
  };

  const removeSkill = (skillId) => {
    setEntries((prev) => {
      const next = new Map(prev);
      next.delete(skillId);
      return next;
    });
  };

  const entryList = Array.from(entries.values());

  const handleSave = async () => {
    if (!name.trim() || !entryList.length) return;
    setSaving(true);
    setSaveError('');
    try {
      await window.eveApi.savePlan({
        id: isEditing ? editingPlan.id : undefined,
        name: name.trim(),
        scope,
        characterId: scope === 'character' ? Number(account?.characterId) : null,
        entries: entryList
      });
      onClose();
    } catch (err) {
      setSaveError(err?.message || String(err));
      setSaving(false);
    }
  };

  if (!account) return <p className="text-gray-500">Select a character from the sidebar.</p>;

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-100">{isEditing ? 'Edit Skill Plan' : 'Create Skill Plan'}</h2>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim() || entryList.length === 0}
          className="px-6 py-2 text-sm font-medium bg-green-600 hover:bg-green-500 text-white rounded transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save & Close'}
        </button>
      </div>

      {saveError && (
        <div className="p-3 rounded-lg border border-red-700 bg-red-900/40 text-sm text-red-300">
          {saveError}
        </div>
      )}

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex flex-wrap gap-4">
          <div className="flex-1 min-w-64">
            <label className="block text-sm text-gray-400 mb-1">Plan name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="Enter plan name..."
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Applies to</label>
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value)}
              className="bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            >
              <option value="global">All characters</option>
              <option value="character">
                This character only{account?.characterName ? ` (${account.characterName})` : ''}
              </option>
            </select>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-md font-semibold text-gray-100 mb-2">
            All Skills {catalog ? `(${catalog.length})` : ''}
          </h3>
          {catalogError && (
            <p className="text-sm text-red-300 mb-2">Failed to load skill catalog: {catalogError}</p>
          )}
          {!catalog && !catalogError && (
            <p className="text-sm text-gray-400">Loading skill catalog...</p>
          )}
          {catalog === null && !catalogError && (
            <p className="text-sm text-gray-400">
              Skill database is not loaded. Open <b>Debug</b> tab → <b>Run Action</b> →{' '}
              <b>Download Static DB</b> to browse all skills.
            </p>
          )}
          {catalog && (
            <div className="max-h-[60vh] overflow-y-auto pr-1">
              {groups.length === 0 ? (
                <p className="text-gray-500 italic">No skills found.</p>
              ) : (
                groups.map(([groupName, skills]) => (
                  <details key={groupName} className="group">
                    <summary className="cursor-pointer text-sm font-medium text-blue-400 hover:text-blue-300">
                      {groupName} ({skills.length})
                    </summary>
                    <div className="mt-1 mb-2 pl-3 space-y-0.5">
                      {skills.map((skill) => {
                        const current = entries.get(skill.id)?.level || 0;
                        const maxed = current >= MAX_LEVEL;
                        const charLevel = skillLevels[skill.id] || 0;
                        return (
                          <div key={skill.id} className="flex justify-between items-center py-0.5">
                            <span className="text-xs text-gray-300 pr-2">{skill.name}</span>
                            {charLevel > 0 && (
                              <span className="text-xs text-gray-500 pr-2 shrink-0">L{charLevel}</span>
                            )}
                            <button
                              onClick={() => addSkill(skill)}
                              disabled={maxed}
                              title={maxed ? `${skill.name} is at level ${MAX_LEVEL}` : `Add ${skill.name}`}
                              className={`w-6 h-6 rounded text-sm font-bold shrink-0 ${
                                maxed
                                  ? 'bg-gray-700 text-gray-500 cursor-default'
                                  : 'bg-green-700 hover:bg-green-600 text-white'
                              }`}
                            >
                              {maxed ? '✓' : '+'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                ))
              )}
            </div>
          )}
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h3 className="text-md font-semibold text-gray-100 mb-2">
            Plan Skills ({entryList.length})
          </h3>
          <div className="max-h-[60vh] overflow-y-auto pr-1">
            {entryList.length === 0 ? (
              <p className="text-gray-500 italic text-sm">
                Click the + next to a skill to add it to this plan.
              </p>
            ) : (
              <div className="space-y-1">
                {entryList.map((entry) => (
                  <div
                    key={entry.skillId}
                    className="flex justify-between items-center bg-gray-700 p-2 rounded"
                  >
                    <span className="text-sm text-gray-200">
                      {entry.name} <span className="text-xs text-gray-400">L{entry.level}</span>
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => decreaseSkill(entry)}
                        disabled={entry.level <= 1}
                        title="Remove one level"
                        className="w-6 h-6 rounded bg-gray-600 hover:bg-gray-500 text-sm text-white disabled:opacity-40"
                      >
                        −
                      </button>
                      <button
                        onClick={() => removeSkill(entry.skillId)}
                        title="Remove from plan"
                        className="w-6 h-6 rounded bg-red-700 hover:bg-red-600 text-sm text-white"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
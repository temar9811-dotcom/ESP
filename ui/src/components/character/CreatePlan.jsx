// File: ui/src/components/character/CreatePlan.jsx | Version: 2.1
import React, { useState, useEffect, useMemo } from 'react';

const MAX_LEVEL = 5;

const CHAR_ATTR_KEY = {
  164: 'charisma',
  165: 'intelligence',
  166: 'memory',
  167: 'perception',
  168: 'willpower'
};

const spAtLevel = (rank, level) => {
  const r = Number(rank) > 0 ? Number(rank) : 1;
  const l = Number(level) || 0;
  return l <= 0 ? 0 : Math.round(250 * r * Math.pow(Math.sqrt(32), l - 1));
};

const formatSP = (n) => {
  const v = Number(n) || 0;
  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
  if (v >= 1000) return `${Math.round(v / 1000)}K`;
  return String(v);
};

const formatTrain = (minutes) => {
  const m = Math.round(Number(minutes) || 0);
  if (m <= 0) return '0m';
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = Math.floor(m % 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (mm > 0 || parts.length === 0) parts.push(`${mm}m`);
  return parts.join(' ');
};

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
  const isChild = isEditing && Boolean(editingPlan?.parentId);
  const [catalog, setCatalog] = useState(null);
  const [catalogError, setCatalogError] = useState('');
  const [skillLevels, setSkillLevels] = useState({});
  const [attributes, setAttributes] = useState(null);
  const [name, setName] = useState(isEditing ? editingPlan.name || '' : '');
  const [scope, setScope] = useState('character');
  const [entries, setEntries] = useState(() => entriesFromPlan(editingPlan));
  const [collapsed, setCollapsed] = useState(() => new Set());
  const [showTrained, setShowTrained] = useState(false);
  const toggleCollapsed = (skillId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(skillId)) next.delete(skillId);
      else next.add(skillId);
      return next;
    });
  };
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
        setAttributes(data?.attributes || null);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [account?.characterId]);

  const catalogById = useMemo(() => {
    const m = new Map();
    (catalog || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [catalog]);

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
      const charLevel = skillLevels[skill.id] || 0;
      const base = existing?.level || Math.min(MAX_LEVEL, Math.max(1, charLevel + 1));
      const level = Math.min(MAX_LEVEL, base + (existing ? 1 : 0));
      next.set(skill.id, { skillId: Number(skill.id), name: skill.name, level });
      addPrerequisites(next, skill, new Set([Number(skill.id)]));
      return next;
    });
  };

  const addPrerequisites = (map, skill, visited) => {
    const prs = skill.prerequisites || [];
    for (const pr of prs) {
      const prId = Number(pr.skillId);
      if (visited.has(prId)) continue;
      visited.add(prId);
      const prSkill = catalogById.get(prId);
      const trained = skillLevels[prId] || 0;
      const prLevel = Math.min(MAX_LEVEL, Math.max(Number(pr.level) || 1, map.get(prId)?.level || 0));
      if (prLevel > trained) {
        map.set(prId, { skillId: prId, name: pr.name || prSkill?.name || `Skill ${prId}`, level: prLevel });
      }
      if (prSkill) addPrerequisites(map, prSkill, visited);
    }
  };

  const requiredLevelOf = (skillId, plan) => {
    let need = 0;
    for (const e of plan.values()) {
      if (Number(e.skillId) === Number(skillId)) continue;
      const skill = catalogById.get(e.skillId);
      const pr = Array.isArray(skill?.prerequisites) ? skill.prerequisites.find((p) => Number(p.skillId) === Number(skillId)) : null;
      if (pr) need = Math.max(need, Math.min(MAX_LEVEL, Number(pr.level) || 1));
    }
    return need;
  };

  const decreaseSkill = (entry) => {
    setEntries((prev) => {
      const next = new Map(prev);
      const charLevel = skillLevels[entry.skillId] || 0;
      const needed = Math.max(requiredLevelOf(entry.skillId, next), charLevel);
      const target = Math.max(entry.level - 1, needed);
      if (target <= charLevel) next.delete(entry.skillId);
      else next.set(entry.skillId, { ...entry, level: target });
      return next;
    });
  };

  const removeSkill = (skillId) => {
    setSaveError('');
    setEntries((prev) => {
      const next = new Map(prev);
      const needed = requiredLevelOf(skillId, next);
      if (needed > 0) {
        setSaveError(`"${next.get(skillId)?.name || `Skill ${skillId}`}" is required by another skill in this plan. Lower or remove that skill first.`);
        return prev;
      }
      next.delete(skillId);
      return next;
    });
  };

  const entryList = Array.from(entries.values());

  // Skipped by default (see showTrained toggle): entries whose planned level the
  // character already has trained are hidden from the planned-skills list.
  const shownEntries = useMemo(
    () => entryList.filter((e) => showTrained || (skillLevels[e.skillId] || 0) < e.level),
    [entryList, skillLevels, showTrained]
  );

  // Summary: remaining SP + train time per plan entry, excluding already-trained levels.
  const summary = useMemo(() => {
    let totalRemainingSP = 0;
    let totalMinutes = 0;
    let attrCount = 0;
    if (attributes) {
      const names = Object.keys(CHAR_ATTR_KEY).map((k) => CHAR_ATTR_KEY[k]);
      attrCount = names.filter((n) => typeof attributes[n] === 'number').length;
    }
    entryList.forEach((entry) => {
      const skill = catalogById.get(entry.skillId);
      const rank = Number(skill?.rank) > 0 ? Number(skill.rank) : 1;
      const charLevel = skillLevels[entry.skillId] || 0;
      if (charLevel >= entry.level) return;
      const targetSp = spAtLevel(rank, entry.level);
      const knownSp = spAtLevel(rank, charLevel);
      const remaining = Math.max(0, targetSp - knownSp);
      totalRemainingSP += remaining;
      if (remaining > 0 && attributes) {
        const pKey = CHAR_ATTR_KEY[skill?.primaryAttr];
        const sKey = CHAR_ATTR_KEY[skill?.secondaryAttr];
        const p = typeof attributes[pKey] === 'number' ? attributes[pKey] : null;
        const s = typeof attributes[sKey] === 'number' ? attributes[sKey] : null;
        const spPerMin = (p !== null && s !== null) ? (p + s / 2) : 45;
        totalMinutes += remaining / spPerMin;
      }
    });
    return { totalRemainingSP, totalMinutes, hasAttributes: attrCount === 5 };
  }, [entryList, catalogById, skillLevels, attributes]);

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

  const attrLabel = (key, label) => (
    <span key={key} className="whitespace-nowrap" title={label}>
      <span className="text-gray-400">{label}:</span>{' '}
      <span className="text-gray-200 font-mono">{typeof attributes?.[key] === 'number' ? attributes[key] : '—'}</span>
    </span>
  );

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-100">
          {isEditing ? 'Edit Skill Plan' : 'Create Skill Plan'}
          {isChild && <span className="ml-2 text-xs font-normal text-blue-400">Shared plan</span>}
        </h2>
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

      {isChild && (
        <div className="p-3 rounded-lg border border-blue-700 bg-blue-900/30 text-sm text-blue-200">
          {editingPlan?.diverged
            ? 'This is a customized copy for the selected character. Switch "Applies to" to All characters to push these changes to every character.'
            : 'This plan is shared by all characters. Edit per character or switch "Applies to" to All characters to update the shared plan.'}
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
            <div className="max-h-[52vh] overflow-y-auto pr-1">
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
                        const charLevel = skillLevels[skill.id] || 0;
                        if (charLevel >= MAX_LEVEL) return null;
                        const current = entries.get(skill.id)?.level || 0;
                        const maxed = current >= MAX_LEVEL;
                        const rank = Number(skill.rank) > 0 ? Number(skill.rank) : 1;
                        const totalSp = spAtLevel(rank, MAX_LEVEL);
                        const prereqs = Array.isArray(skill.prerequisites) && skill.prerequisites.length
                          ? skill.prerequisites.map((pr) => `${pr.name || `Skill ${pr.skillId}`} L${pr.level}`).join(', ')
                          : null;
                        return (
                          <div key={skill.id} className="py-0.5">
                            <div className="flex justify-between items-center">
                              <span className="text-xs text-gray-300 pr-2 truncate">{skill.name}</span>
                              <span className="text-xs text-gray-500 pr-2 shrink-0" title="Total SP for all 5 levels">
                                {formatSP(totalSp)} SP
                              </span>
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
                            {prereqs && (
                              <div className="text-[10px] text-gray-500 pl-0.5" title="Auto-added to the plan when this skill is added">
                                Requires {prereqs}
                              </div>
                            )}
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
          <h3 className="text-md font-semibold text-gray-100 mb-2 flex items-center gap-3">
            <span>Plan Skills ({shownEntries.length})</span>
            <label className="flex items-center gap-1 text-xs font-normal text-gray-400 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showTrained}
                onChange={(e) => setShowTrained(e.target.checked)}
                className="accent-blue-500"
              />
              Show trained skills
            </label>
          </h3>
          <div className="max-h-[52vh] overflow-y-auto pr-1">
            {shownEntries.length === 0 ? (
              <p className="text-gray-500 italic text-sm">
                {entryList.some((e) => (skillLevels[e.skillId] || 0) >= e.level)
                  ? 'All skills in this plan are already trained for this character.'
                  : 'Click the + next to a skill to add it to this plan.'}
              </p>
            ) : (
              <div className="space-y-1">
                {shownEntries.map((entry) => {
                  const skill = catalogById.get(entry.skillId);
                  const rank = Number(skill?.rank) > 0 ? Number(skill.rank) : 1;
                  const charLevel = skillLevels[entry.skillId] || 0;
                  const below = [];
                  for (let l = entry.level - 1; l > charLevel; l--) below.push(l);
                  const fullyTrained = charLevel >= entry.level;
                  return (
                    <div
                      key={entry.skillId}
                      className={`bg-gray-700 p-2 rounded ${fullyTrained ? 'opacity-60' : ''}`}
                    >
                      <div className="flex justify-between items-center">
                        <button
                          onClick={() => toggleCollapsed(entry.skillId)}
                          disabled={below.length === 0}
                          className="flex items-center gap-1 text-sm text-gray-200 disabled:cursor-default"
                        >
                          <span className={`text-xs text-gray-500 w-4 text-left transition-transform ${collapsed.has(entry.skillId) ? '' : 'rotate-90'}`}>
                            ▶
                          </span>
                          <span>
                            {entry.name} <span className="text-xs text-gray-400">L{entry.level}</span>
                            {fullyTrained && <span className="ml-1 text-[10px] text-gray-500">trained</span>}
                          </span>
                        </button>
                        <span className="text-xs text-gray-500" title="SP remaining to reach this level">
                          {formatSP(spAtLevel(rank, entry.level) - spAtLevel(rank, charLevel))} SP
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => decreaseSkill(entry)}
                            disabled={entry.level <= Math.max(1, charLevel + 1)}
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
                      {below.length > 0 && !collapsed.has(entry.skillId) && (
                        <div className="mt-1 ml-6 space-y-0.5 border-l border-gray-600 pl-3">
                          {below.map((l) => (
                            <div key={l} className="flex items-center justify-between text-xs">
                              <span className="text-gray-400">├─ {entry.name} L{l}</span>
                              <span className="text-gray-500" title="SP remaining to reach this level">
                                {formatSP(spAtLevel(rank, l) - spAtLevel(rank, charLevel))} SP
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs uppercase text-gray-500 mb-1">Attributes · {account.characterName || 'Character'}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {[
              ['intelligence', 'Int'],
              ['memory', 'Mem'],
              ['perception', 'Per'],
              ['willpower', 'Wil'],
              ['charisma', 'Cha']
            ].map(([key, label]) => attrLabel(key, label))}
          </div>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500 mb-1">Total SP</p>
          <p className="text-xl font-mono text-blue-400">
            {formatSP(summary.totalRemainingSP)} SP
          </p>
          <p className="text-xs text-gray-500">remaining to train (excludes already-trained)</p>
        </div>
        <div>
          <p className="text-xs uppercase text-gray-500 mb-1">Est. training time</p>
          <p className="text-xl font-mono text-green-400">{formatTrain(summary.totalMinutes)}</p>
          <p className="text-xs text-gray-500">
            {summary.hasAttributes
              ? 'based on current attributes'
              : 'attribute data unavailable — using default rate'}
          </p>
        </div>
      </div>
    </div>
  );
}
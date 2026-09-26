// File: ui/src/components/character/SkillPlans.jsx | Version: 2.6
import React, { useState, useEffect, useMemo } from 'react';
import SkillPlanModal from '../modals/SkillPlanModal';
import PlanDetailModal from '../modals/PlanDetailModal';
import { formatSP, formatTrain, summarizePlan } from '../../utils/planSummary';

export default function SkillPlans({ account, onCreatePlan, onEditPlan }) {
  const characterId = account?.characterId;
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [draft, setDraft] = useState(null);
  const [viewPlan, setViewPlan] = useState(null);
  const [catalog, setCatalog] = useState(null);
  const [skillLevels, setSkillLevels] = useState({});
  const [attributes, setAttributes] = useState(null);

  const fetchPlans = async () => {
    const data = await window.eveApi.listPlans();
    setPlans(data || []);
  };

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    fetchPlans()
      .catch(() => setPlans([]))
      .finally(() => { if (isMounted) setLoading(false); });
    return () => { isMounted = false; };
  }, [characterId]);

  // Skill catalog (rank + attributes) for the SP math.
  useEffect(() => {
    let isMounted = true;
    window.eveApi.getAllSkills()
      .then((all) => { if (isMounted) setCatalog(Array.isArray(all) ? all : null); })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  // The character's trained levels + attributes, so totals show what is
  // actually left to train rather than the full cost of the plan.
  useEffect(() => {
    let isMounted = true;
    if (!characterId) return;
    window.eveApi.getSkillsData(characterId)
      .then((data) => {
        if (!isMounted) return;
        const map = {};
        (data?.skills || []).forEach((s) => { map[s.skill_id] = s.trained_skill_level; });
        setSkillLevels(map);
        setAttributes(data?.attributes || null);
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [characterId]);

  const catalogById = useMemo(() => {
    const m = new Map();
    (catalog || []).forEach((s) => m.set(s.id, s));
    return m;
  }, [catalog]);

  const isChildPlan = (plan) => Boolean(plan?.parentId);

  const appliesToAccount = (plan) => {
    if (plan?.scope === 'global' && !isChildPlan(plan)) {
      const hasChildCopy = plans.some((p) => p.parentId === plan.id && Number(p.characterId) === Number(characterId));
      return !hasChildCopy;
    }
    return Number(plan?.characterId) === Number(characterId);
  };

  const planLabel = (plan) => {
    if (isChildPlan(plan)) {
      return plan.diverged ? 'This character only (customized)' : 'All characters (shared)';
    }
    return plan.scope === 'global' ? 'All characters' : 'Character-specific';
  };

  const applicablePlans = plans.filter(appliesToAccount);

  const handleImport = async () => {
    setImporting(true);
    setImportError('');
    try {
      const result = await window.eveApi.readClipboardPlan();
      if (!result || !Array.isArray(result.entries) || !result.entries.length) {
        setImportError('No valid skill lines found in the clipboard.');
        return;
      }
      setDraft({ entries: result.entries, errors: result.errors || [] });
    } catch (err) {
      setImportError(err?.message || String(err));
    } finally {
      setImporting(false);
    }
  };

  const handleSaveDraft = async (meta) => {
    const saved = await window.eveApi.savePlan({
      name: meta.name,
      scope: meta.scope,
      characterId: meta.scope === 'character' ? Number(characterId) : null,
      entries: draft.entries
    });
    await fetchPlans();
    return saved;
  };

  const handleDelete = async (planId) => {
    try {
      await window.eveApi.deletePlan(planId);
      await fetchPlans();
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  if (loading) return <div className="p-4 text-gray-400">Loading plans...</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      {draft && (
        <SkillPlanModal
          draft={draft}
          account={account}
          onClose={() => setDraft(null)}
          onSave={handleSaveDraft}
        />
      )}

      {viewPlan && <PlanDetailModal plan={viewPlan} onClose={() => setViewPlan(null)} />}

      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Skill Plans</h2>
        <div className="flex gap-2">
          <button
            onClick={onCreatePlan}
            className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 text-white rounded"
          >
            Create Plan
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {importing ? 'Importing...' : 'Import from Clipboard'}
          </button>
        </div>
      </div>

      {importError && (
        <div className="p-3 rounded-lg border border-red-700 bg-red-900/40 text-sm text-red-300">
          {importError}
        </div>
      )}

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        {applicablePlans.length === 0 ? (
          <p className="text-gray-500 italic">
            No skill plans apply to this character. Use "Create Plan" or "Import from Clipboard" to make one.
          </p>
        ) : (
          <div className="space-y-2">
            {applicablePlans.map((plan) => {
              const totals = summarizePlan(plan.entries, catalogById, skillLevels, attributes);
              return (
              <div
                key={plan.id}
                onClick={() => setViewPlan(plan)}
                className="flex justify-between items-center bg-gray-700 p-3 rounded cursor-pointer hover:bg-gray-600/60"
              >
                <div>
                  <p className="text-sm font-medium text-gray-200">{plan.name || 'Unnamed Plan'}</p>
                  <p className="text-xs text-gray-400">
                    {planLabel(plan)} · {plan.entries?.length || 0} skills
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div
                    className="text-right leading-tight"
                    title={totals.hasAttributes
                      ? 'Remaining SP to train, and estimated time at your current attributes'
                      : 'Remaining SP to train (estimated time uses a default rate - attribute data unavailable)'}
                  >
                    <p className="text-xs font-mono text-blue-400">{formatSP(totals.totalRemainingSP)} SP</p>
                    <p className="text-xs font-mono text-green-400">{formatTrain(totals.totalMinutes)}</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); onEditPlan && onEditPlan(plan); }}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Edit
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(plan.id); }}
                    className="text-red-400 hover:text-red-300 text-sm"
                  >
                    Delete
                  </button>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
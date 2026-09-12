// File: ui/src/components/character/SkillPlans.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function SkillPlans({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchPlans = async () => {
      setLoading(true);
      try {
        const data = await window.eveApi.listPlans();
        if (isMounted) setPlans(data || []);
      } catch (err) {
        console.error('Failed to load plans:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchPlans();
    return () => { isMounted = false; };
  }, [characterId]);

  const handleImport = async () => {
    setImporting(true);
    try {
      const newPlan = await window.eveApi.readClipboardPlan();
      if (newPlan) {
        await window.eveApi.savePlan(newPlan);
        const updated = await window.eveApi.listPlans();
        setPlans(updated || []);
      }
    } catch (err) {
      console.error('Failed to import plan:', err);
    } finally {
      setImporting(false);
    }
  };

  const handleDelete = async (planId) => {
    try {
      await window.eveApi.deletePlan(planId);
      setPlans(prev => prev.filter(p => p.id !== planId));
    } catch (err) {
      console.error('Failed to delete plan:', err);
    }
  };

  if (loading) return <div className="p-4 text-gray-400">Loading plans...</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-gray-100">Skill Plans</h2>
        <button 
          onClick={handleImport} 
          disabled={importing}
          className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
          {importing ? 'Importing...' : 'Import from Clipboard'}
        </button>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        {plans.length === 0 ? (
          <p className="text-gray-500 italic">No skill plans saved.</p>
        ) : (
          <div className="space-y-2">
            {plans.map((plan) => (
              <div key={plan.id} className="flex justify-between items-center bg-gray-700 p-3 rounded">
                <div>
                  <p className="text-sm font-medium text-gray-200">{plan.name || 'Unnamed Plan'}</p>
                  <p className="text-xs text-gray-400">{plan.skills?.length || 0} skills</p>
                </div>
                <button 
                  onClick={() => handleDelete(plan.id)} 
                  className="text-red-400 hover:text-red-300 text-sm">
                  Delete
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
// File: ui/src/components/modals/SkillPlanModal.jsx | Version: 1.0
import React, { useState } from 'react';

export default function SkillPlanModal({ plan, onClose, onSave }) {
  const [name, setName] = useState(plan?.name || '');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const updatedPlan = { ...plan, name: name.trim() };
      await window.eveApi.savePlan(updatedPlan);
      onSave(updatedPlan);
      onClose();
    } catch (err) {
      console.error('Failed to save plan:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96">
        <h2 className="text-xl font-bold text-gray-100 mb-4">{plan?.id ? 'Edit' : 'Create'} Skill Plan</h2>
        
        <div className="mb-6">
          <label className="block text-sm text-gray-400 mb-1">Plan Name</label>
          <input 
            type="text" 
            value={name} 
            onChange={(e) => setName(e.target.value)} 
            className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="Enter plan name..."
          />
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading || !name.trim()} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
            {loading ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
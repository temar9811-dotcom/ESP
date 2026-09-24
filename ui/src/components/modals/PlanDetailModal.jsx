// File: ui/src/components/modals/PlanDetailModal.jsx | Version: 1.1
import React, { useState } from 'react';

export default function PlanDetailModal({ plan, onClose }) {
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');

  const handleExport = async () => {
    setStatus('');
    setError('');
    try {
      await window.eveApi.exportPlanToClipboard(plan.id);
      setStatus(`Copied ${plan.entries?.length || 0} skill line(s) to the clipboard.`);
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const isChildPlan = Boolean(plan?.parentId);
  const scopeLabel = isChildPlan
    ? (plan.diverged ? 'This character (customized)' : 'All characters (shared)')
    : (plan.scope === 'global' ? 'All characters' : 'Character-specific');

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-100 mb-1">{plan.name || 'Unnamed Plan'}</h2>
        <p className="text-sm text-gray-400 mb-4">
          {scopeLabel} ·{' '}
          {plan.entries?.length || 0} skills
        </p>

        <div className="max-h-72 overflow-y-auto mb-4 space-y-1">
          {!plan.entries?.length ? (
            <p className="text-gray-500 italic text-sm">This plan has no skills.</p>
          ) : (
            plan.entries.map((entry, index) => (
              <div
                key={index}
                className="flex justify-between items-center bg-gray-700 p-2 rounded"
              >
                <span className="text-sm text-gray-200">{entry.name}</span>
                <span className="text-xs text-gray-400">L{entry.level}</span>
              </div>
            ))
          )}
        </div>

        {status && <p className="mb-4 text-sm text-green-400">{status}</p>}
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Close
          </button>
          <button
            onClick={handleExport}
            disabled={!plan.entries?.length}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            Export Skill Plan to Clipboard
          </button>
        </div>
      </div>
    </div>
  );
}
// File: ui/src/components/modals/SkillPlanModal.jsx | Version: 2.0
import React, { useState } from 'react';

export default function SkillPlanModal({ draft, account, onClose, onSave }) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('global');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const entryCount = Array.isArray(draft?.entries) ? draft.entries.length : 0;
  const parseErrors = Array.isArray(draft?.errors) ? draft.errors : [];

  const handleSave = async () => {
    if (!name.trim()) return;
    setSaving(true);
    setError('');
    try {
      await onSave({ name: name.trim(), scope });
      onClose();
    } catch (err) {
      setError(err?.message || String(err));
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-gray-100 mb-1">Add Skill Plan from Clipboard</h2>
        <p className="text-sm text-gray-400 mb-4">
          {entryCount} skill{entryCount === 1 ? '' : 's'} found
        </p>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Plan name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
            className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="Enter plan name..."
          />
        </div>

        <div className="mb-4">
          <label className="block text-sm text-gray-400 mb-1">Applies to</label>
          <select
            value={scope}
            onChange={(e) => setScope(e.target.value)}
            className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
          >
            <option value="global">All characters</option>
            <option value="character">
              This character only{account?.characterName ? ` (${account.characterName})` : ''}
            </option>
          </select>
        </div>

        {parseErrors.length > 0 && (
          <div className="mb-4 p-2 rounded bg-yellow-900/40 border border-yellow-700 text-xs text-yellow-200">
            {parseErrors.length} line{parseErrors.length === 1 ? '' : 's'} skipped:
            <ul className="list-disc ml-4 mt-1">
              {parseErrors.slice(0, 5).map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ul>
          </div>
        )}

        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}

        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Plan'}
          </button>
        </div>
      </div>
    </div>
  );
}
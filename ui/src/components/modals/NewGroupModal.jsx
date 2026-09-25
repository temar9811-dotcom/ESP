// File: ui/src/components/modals/NewGroupModal.jsx | Version: 1.0
import React, { useState } from 'react';

export default function NewGroupModal({ onClose, onSubmit }) {
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    const clean = name.trim();
    if (!clean) {
      setError('Please enter a group name.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await onSubmit(clean);
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
        <h2 className="text-xl font-bold text-gray-100 mb-4">New Group</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          onKeyDown={(e) => { if (e.key === 'Enter' && !saving) handleSubmit(); }}
          className="w-full bg-gray-900 text-gray-200 p-2 rounded border border-gray-600 focus:outline-none focus:border-blue-500 mb-4"
          placeholder="Group name..."
        />
        {error && <p className="mb-4 text-sm text-red-400">{error}</p>}
        <div className="flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50"
          >
            {saving ? 'Creating...' : 'Create Group'}
          </button>
        </div>
      </div>
    </div>
  );
}
// File: ui/src/components/character/Notes.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function Notes({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchNotes = async () => {
      setLoading(true);
      try {
        const data = await window.eveApi.getNotes(characterId);
        if (isMounted) setNotes(data || '');
      } catch (err) {
        console.error('Failed to load notes:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchNotes();
    return () => { isMounted = false; };
  }, [characterId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await window.eveApi.setNotes(characterId, notes);
    } catch (err) {
      console.error('Failed to save notes:', err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4 text-gray-400">Loading notes...</div>;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-gray-100">Character Notes</h2>
          <button 
            onClick={handleSave} 
            disabled={saving}
            className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Notes'}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full h-64 bg-gray-900 text-gray-200 p-3 rounded border border-gray-600 focus:outline-none focus:border-blue-500 resize-none"
          placeholder="Add notes about this character..."
        />
      </div>
    </div>
  );
}
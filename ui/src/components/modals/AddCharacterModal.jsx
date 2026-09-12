// File: ui/src/components/modals/AddCharacterModal.jsx | Version: 1.0
import React, { useState } from 'react';

export default function AddCharacterModal({ onClose }) {
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState('standard');

  const handleLogin = async () => {
    setLoading(true);
    try {
      await window.eveApi.addAccount(scope);
      onClose();
    } catch (err) {
      console.error('Login failed:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = async () => {
    try {
      await window.eveApi.cancelLogin();
    } catch (err) {
      console.error('Cancel failed:', err);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96">
        <h2 className="text-xl font-bold text-gray-100 mb-4">Add Character</h2>
        <p className="text-sm text-gray-400 mb-4">Select the ESI scopes for this character:</p>
        
        <div className="space-y-2 mb-6">
          <label className="flex items-center gap-2 text-gray-200">
            <input type="radio" name="scope" value="standard" checked={scope === 'standard'} onChange={(e) => setScope(e.target.value)} />
            Standard (Skills, Wallet, Clones)
          </label>
          <label className="flex items-center gap-2 text-gray-200">
            <input type="radio" name="scope" value="full" checked={scope === 'full'} onChange={(e) => setScope(e.target.value)} />
            Full (Includes Assets, Skill Plans)
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={handleCancel} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
            Cancel
          </button>
          <button onClick={handleLogin} disabled={loading} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded disabled:opacity-50">
            {loading ? 'Logging in...' : 'Login with EVE SSO'}
          </button>
        </div>
      </div>
    </div>
  );
}
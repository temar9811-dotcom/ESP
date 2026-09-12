// File: ui/src/components/modals/SettingsModal.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function SettingsModal({ onClose }) {
  const [settings, setSettings] = useState({ startWithWindows: false, notifications: true });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await window.eveApi.getSettings();
        if (data) setSettings(data);
      } catch (err) {
        console.error('Failed to load settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    try {
      await window.eveApi.setSettings(settings);
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
    }
  };

  const updateSetting = (key, value) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  if (loading) return <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div className="text-gray-400">Loading...</div></div>;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 w-96">
        <h2 className="text-xl font-bold text-gray-100 mb-4">Settings</h2>
        
        <div className="space-y-4 mb-6">
          <label className="flex items-center justify-between text-gray-200">
            <span>Start with Windows</span>
            <input type="checkbox" checked={settings.startWithWindows} onChange={(e) => updateSetting('startWithWindows', e.target.checked)} className="w-4 h-4" />
          </label>
          <label className="flex items-center justify-between text-gray-200">
            <span>Enable Notifications</span>
            <input type="checkbox" checked={settings.notifications} onChange={(e) => updateSetting('notifications', e.target.checked)} className="w-4 h-4" />
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded">
            Cancel
          </button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
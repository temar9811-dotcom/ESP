// File: ui/src/components/global/SettingsTab.jsx | Version: 1.1
import React, { useState, useEffect } from 'react';
import { THEME_OPTIONS, applyTheme } from '../../theme';

export default function SettingsTab({ onClose }) {
  const [settings, setSettings] = useState(null);
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
    if (key === 'theme') applyTheme(value);
  };

  if (loading || !settings) return <div className="p-4 text-gray-400">Loading settings...</div>;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h2 className="text-xl font-bold text-gray-100">Settings</h2>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-md font-semibold text-gray-200">System</h3>
        <label className="flex items-center justify-between text-gray-300">
          <span>Start with Windows</span>
          <input type="checkbox" checked={settings.openAtLogin} onChange={(e) => updateSetting('openAtLogin', e.target.checked)} className="w-4 h-4" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Start minimized to tray</span>
          <input type="checkbox" checked={settings.startMinimized} onChange={(e) => updateSetting('startMinimized', e.target.checked)} className="w-4 h-4" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Hide primary character when a group is collapsed</span>
          <input type="checkbox" checked={settings.hidePrimaryWhenCollapsed} onChange={(e) => updateSetting('hidePrimaryWhenCollapsed', e.target.checked)} className="w-4 h-4" />
        </label>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-md font-semibold text-gray-200">Notifications</h3>
        <label className="flex items-center justify-between text-gray-300">
          <span>Mute notification sounds</span>
          <input type="checkbox" checked={settings.muteSounds} onChange={(e) => updateSetting('muteSounds', e.target.checked)} className="w-4 h-4" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Show skill complete notifications</span>
          <input type="checkbox" checked={settings.notifySkill} onChange={(e) => updateSetting('notifySkill', e.target.checked)} className="w-4 h-4" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Show wallet activity notifications</span>
          <input type="checkbox" checked={settings.notifyWallet} onChange={(e) => updateSetting('notifyWallet', e.target.checked)} className="w-4 h-4" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Show queue empty/warning notifications</span>
          <input type="checkbox" checked={settings.notifyQueueEmpty} onChange={(e) => updateSetting('notifyQueueEmpty', e.target.checked)} className="w-4 h-4" />
        </label>
        <div className="pt-2 border-t border-gray-700 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Queue warning lead time (hours)</span>
            <input type="number" min="0" value={settings.queueWarnHours} onChange={(e) => updateSetting('queueWarnHours', Number(e.target.value))} className="w-20 bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600 text-right" />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-300">Minimum ISK for wallet notifications</span>
            <input type="number" min="0" value={settings.walletNotifyThreshold} onChange={(e) => updateSetting('walletNotifyThreshold', Number(e.target.value))} className="w-32 bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600 text-right" />
          </div>
        </div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-md font-semibold text-gray-200">Appearance</h3>
        <div className="flex items-center justify-between">
          <span className="text-gray-300">Theme</span>
          <select
            value={settings.theme || ''}
            onChange={(e) => updateSetting('theme', e.target.value)}
            className="w-48 bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600"
          >
            {THEME_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex justify-end">
        <button onClick={handleSave} className="px-6 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors">
          Save & Close
        </button>
      </div>
    </div>
  );
}
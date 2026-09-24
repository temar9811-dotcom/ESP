// File: ui/src/components/global/SettingsTab.jsx | Version: 1.3
import React, { useState, useEffect } from 'react';
import { THEME_OPTIONS, applyTheme, applyTextScale } from '../../theme';
import { USER_TABS, TAB_LABELS, DEFAULT_ENABLED_TABS } from '../../tabs';

export default function SettingsTab({ onClose, onSettingsChange }) {
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
    const next = value;
    setSettings(prev => ({ ...prev, [key]: next }));
    if (key === 'theme') applyTheme(value);
    if (key === 'biggerText') applyTextScale(next);
  };

  const handleTabLock = (which, checked) => {
    const patch = { ...settings };
    if (checked) {
      patch[which] = true;
      patch[which === 'tabsVerticalLock' ? 'tabsHorizontalLock' : 'tabsVerticalLock'] = false;
    } else {
      patch[which] = false;
    }
    setSettings(patch);
    if (onSettingsChange) onSettingsChange(patch);
  };

  const handleToggleTab = (tab, checked) => {
    const enabled = Array.isArray(settings.enabledTabs) ? [...settings.enabledTabs] : [...DEFAULT_ENABLED_TABS];
    const patch = {
      ...settings,
      enabledTabs: checked
        ? (enabled.includes(tab) ? enabled : [...enabled, tab])
        : enabled.filter((t) => t !== tab)
    };
    setSettings(patch);
    if (onSettingsChange) onSettingsChange(patch);
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
        <label className="flex items-center justify-between text-gray-300">
          <span>Larger text (+20%)</span>
          <input type="checkbox" checked={!!settings.biggerText} onChange={(e) => updateSetting('biggerText', e.target.checked)} className="w-4 h-4" />
        </label>
        <div className="pt-2 border-t border-gray-700 space-y-2">
          <p className="text-xs text-gray-500">Tab bar position (choose one, or none to keep responsive)</p>
          <label className="flex items-center justify-between text-gray-300">
            <span>Lock tabs vertical</span>
            <input type="checkbox" checked={!!settings.tabsVerticalLock} onChange={(e) => handleTabLock('tabsVerticalLock', e.target.checked)} className="w-4 h-4" />
          </label>
          <label className="flex items-center justify-between text-gray-300">
            <span>Lock tabs horizontal</span>
            <input type="checkbox" checked={!!settings.tabsHorizontalLock} onChange={(e) => handleTabLock('tabsHorizontalLock', e.target.checked)} className="w-4 h-4" />
          </label>
        </div>
      </div>
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700 space-y-4">
        <h3 className="text-md font-semibold text-gray-200">Tab Activation</h3>
        <p className="text-xs text-gray-500">Uncheck a tab to hide it from the tab bar.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {USER_TABS.map((tab) => (
            <label key={tab} className="flex items-center justify-between text-gray-300">
              <span>{TAB_LABELS[tab] || tab}</span>
              <input
                type="checkbox"
                checked={!Array.isArray(settings.enabledTabs) || settings.enabledTabs.includes(tab)}
                onChange={(e) => handleToggleTab(tab, e.target.checked)}
                className="w-4 h-4"
              />
            </label>
          ))}
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
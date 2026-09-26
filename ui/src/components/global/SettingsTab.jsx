// File: ui/src/components/global/SettingsTab.jsx | Version: 1.4
import React, { useState, useEffect } from 'react';
import { THEME_OPTIONS, applyTheme, applyTextScale } from '../../theme';
import { USER_TABS, TAB_LABELS, DEFAULT_ENABLED_TABS } from '../../tabs';

export default function SettingsTab({ onClose, onSettingsChange }) {
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [moveActive, setMoveActive] = useState(false);
  const [moveFeedback, setMoveFeedback] = useState('');

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

  const handleToastMove = async () => {
    if (!moveActive) {
      try {
        await window.eveApi.startToastMove();
        setMoveActive(true);
        setMoveFeedback('Move mode active — drag the toast box, then click "Save position".');
      } catch (err) {
        setMoveFeedback(err?.message || 'Could not start move mode.');
      }
      return;
    }
    try {
      const res = await window.eveApi.endToastMove();
      setMoveActive(false);
      setMoveFeedback(
        res && res.ok
          ? `Toast position saved (${res.x}, ${res.y}).`
          : (res?.error || 'Toast position saved.')
      );
    } catch (err) {
      setMoveFeedback(err?.message || 'Could not save position.');
    }
  };

  const handleCancelMove = () => {
    setMoveActive(false);
    setMoveFeedback('Move cancelled — position unchanged.');
  };

  const handleTestToast = () => {
    window.eveApi.showToast(
      'ESP Test Toast',
      `This is a sample notification.\nMax visible: ${settings.toastMaxVisible}, duration: ${settings.toastDurationMs / 1000}s.`,
      'skill'
    );
  };

  const SOUND_ROWS = [
    { key: 'customSoundSkill', label: 'Skill complete sound' },
    { key: 'customSoundWallet', label: 'Wallet activity sound' },
    { key: 'customSoundQueue', label: 'Queue empty/warning sound' }
  ];

  const fileBaseName = (p) => (p ? String(p).split(/[\\/]/).pop() : null);

  const handlePickSound = async (typeKey) => {
    try {
      const res = await window.eveApi.pickSound();
      if (res && !res.canceled && res.path) {
        setSettings((prev) => ({ ...prev, [typeKey]: res.path }));
      }
    } catch (err) {
      setMoveFeedback(`Could not choose sound: ${err?.message || err}`);
    }
  };

  const handleResetSound = (typeKey) => {
    setSettings((prev) => ({ ...prev, [typeKey]: null }));
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
        <label className="flex items-center justify-between text-gray-300">
          <span title="ESP always checks for a new release once an hour. Turn this off to install updates only when you click Update Now in the top bar.">
            Install updates automatically
          </span>
          <input type="checkbox" checked={settings.autoInstallUpdates !== false} onChange={(e) => updateSetting('autoInstallUpdates', e.target.checked)} className="w-4 h-4" />
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
          <p className="text-xs text-gray-500">
            Replace the built-in chime with a custom WAV per notification type (plays through the Windows toast overlay; other platforms keep the system sound).
          </p>
          {SOUND_ROWS.map((row) => {
            const current = settings[row.key] ? fileBaseName(settings[row.key]) : null;
            return (
              <div key={row.key} className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex-1 min-w-40">
                  <div className="text-gray-300">{row.label}</div>
                  <div className="text-xs text-gray-500 truncate">{current || 'Default chime'}</div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handlePickSound(row.key)}
                    className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                  >
                    Choose WAV…
                  </button>
                  <button
                    onClick={() => handleResetSound(row.key)}
                    disabled={!settings[row.key]}
                    className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-300 rounded disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Reset
                  </button>
                </div>
              </div>
            );
          })}
        </div>
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
        <h3 className="text-md font-semibold text-gray-200">Toast Notifications</h3>
        <p className="text-xs text-gray-500">The toast box shows notification bubbles over your taskbar (Windows).</p>
        <label className="flex items-center justify-between text-gray-300">
          <span>Number of toasts shown at once</span>
          <input type="number" min="1" max="10" value={settings.toastMaxVisible} onChange={(e) => updateSetting('toastMaxVisible', Math.max(1, Math.min(10, Number(e.target.value) || 5)))} className="w-16 bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600 text-right" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>Time toasts stay on screen (seconds)</span>
          <input type="number" min="2" max="30" value={Math.round((settings.toastDurationMs ?? 8000) / 1000)} onChange={(e) => updateSetting('toastDurationMs', Math.max(2000, Math.min(30000, (Number(e.target.value) || 8) * 1000)))} className="w-16 bg-gray-700 text-gray-200 px-2 py-1 rounded border border-gray-600 text-right" />
        </label>
        <label className="flex items-center justify-between text-gray-300">
          <span>New toasts on top</span>
          <input type="checkbox" checked={!!settings.toastStackTop} onChange={(e) => updateSetting('toastStackTop', e.target.checked)} className="w-4 h-4" />
        </label>
        <div className="pt-2 border-t border-gray-700 space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-gray-300">Toast box position</span>
            <div className="flex gap-2">
              {moveActive ? (
                <>
                  <button
                    onClick={handleToastMove}
                    className="px-3 py-1 text-sm bg-green-600 hover:bg-green-500 text-white rounded"
                  >
                    Save position
                  </button>
                  <button
                    onClick={handleCancelMove}
                    className="px-3 py-1 text-sm bg-gray-700 hover:bg-gray-600 text-gray-200 rounded"
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  onClick={handleToastMove}
                  className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded"
                >
                  Move toast box
                </button>
              )}
            </div>
          </div>
          {moveActive && (
            <p className="text-xs text-blue-300">Drag the highlighted toast box to a new spot on screen.</p>
          )}
          {moveFeedback && <p className="text-xs text-gray-400">{moveFeedback}</p>}
        </div>
        <div className="pt-2 border-t border-gray-700">
          <button
            onClick={handleTestToast}
            className="px-3 py-1 text-sm bg-indigo-600 hover:bg-indigo-500 text-white rounded"
          >
            Show test toast
          </button>
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
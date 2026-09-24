// ui/src/App.jsx | Version: 2.2
import React, { useState, useEffect, useRef } from 'react';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/global/ToastContainer';
import SyncIndicator from './components/global/SyncIndicator';
import BottomBar from './components/global/BottomBar';
import OceanWaves from './components/global/OceanWaves';
import DebugTab from './components/global/DebugTab';
import SettingsTab from './components/global/SettingsTab';
import Overview from './components/character/Overview';
import Skills from './components/character/Skills';
import Wallet from './components/character/Wallet';
import Assets from './components/character/Assets';
import Clones from './components/character/Clones';
import Notifications from './components/character/Notifications';
import Notes from './components/character/Notes';
import SkillPlans from './components/character/SkillPlans';
import CreatePlan from './components/character/CreatePlan';
import UpdateDialog from './components/UpdateDialog';
import ChangelogDialog from './components/ChangelogDialog';
import { applyTheme, applyTextScale } from './theme';
import { USER_TABS } from './tabs';

export default function App() {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const mainRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [isDev, setIsDev] = useState(false);
  const [unseenNotifications, setUnseenNotifications] = useState([]);
  const [unseenCounts, setUnseenCounts] = useState({});
  const [lastViewedByChar, setLastViewedByChar] = useState({});
  const [settings, setSettings] = useState(null);
  const [editingPlan, setEditingPlan] = useState(null);

  useEffect(() => {
    const host = window.location.hostname;
    setIsDev(host === 'localhost' || host === '127.0.0.1');
  }, []);

  useEffect(() => {
    if (!window.eveApi?.getSettings) return;
    window.eveApi.getSettings().then((s) => {
      setSettings(s);
      if (s?.theme) applyTheme(s.theme);
      applyTextScale(!!s?.biggerText);
    }).catch(() => {});
  }, []);

  const refreshUnseenCounts = () => {
    if (!window.eveApi?.getAllUnseenCounts) return;
    window.eveApi.getAllUnseenCounts().then((c) => setUnseenCounts(c || {})).catch(() => {});
  };

  const handleSelectAccount = async (account) => {
    setSelectedAccount(account);
    if (!account?.characterId || !window.eveApi?.getNotifications) return;
    try {
      const lastViewed = await window.eveApi.getNotificationLastViewed(account.characterId);
      setLastViewedByChar(prev => ({ ...prev, [account.characterId]: Number(lastViewed) || 0 }));
      const unseen = await window.eveApi.getNotifications(account.characterId);
      setUnseenNotifications(unseen || []);
      await window.eveApi.markNotificationsSeen(account.characterId);
      setUnseenCounts(prev => ({ ...prev, [account.characterId]: 0 }));
    } catch {}
  };

  const pushNotification = (charId, type, payload) => {
    const p = payload || {};
    if (String(selectedAccount?.characterId) === String(charId)) {
      const entry = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        type,
        timestamp: Date.now(),
        title: p.title || '',
        message: p.message || '',
        skillName: p.skillName || null,
        level: p.level ?? null,
        remainingMs: p.remainingMs ?? null,
        amount: p.amount ?? null,
        description: p.description || null,
        characterName: p.characterName || null
      };
      setUnseenNotifications(prev => [...prev, entry]);
      window.eveApi?.markNotificationsSeen?.(charId);
    } else {
      setUnseenCounts(prev => {
        const id = String(charId);
        const delta = prev[id] == null ? 1 : prev[id] + 1;
        return { ...prev, [id]: delta };
      });
    }
  };

  const handleLiveSkillCompleted = (p) => {
    addToast('Skill Complete', p.skillName);
    pushNotification(p.characterId, 'skill-complete', { ...p, title: 'Skill complete', message: `${p.skillName || 'Unknown'} L${p.level ?? '?'} finished training.` });
  };
  const handleLiveWalletActivity = (p) => {
    const entries = Array.isArray(p.entries) && p.entries.length ? p.entries : [p];
    for (const entry of entries.slice(0, 5)) {
      const amount = Number(entry.amount || 0);
      const sign = amount >= 0 ? '+' : '';
      const isk = amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
      const desc = entry.description || 'Wallet activity';
      addToast('Wallet Activity', `${desc} (${sign}${isk} ISK)`);
      pushNotification(p.characterId, 'wallet-activity', { ...entry, characterName: p.characterName, title: 'Wallet activity', message: `${desc} (${sign}${isk} ISK)` });
    }
    if (entries.length > 5) {
      pushNotification(p.characterId, 'wallet-activity', { characterName: p.characterName, title: 'Wallet activity', message: `${entries.length - 5} more wallet entries.` });
    }
  };
  const handleLiveQueueWarning = (p) => {
    const mins = Math.max(0, Math.round(Number(p.remainingMs || 0) / 60000));
    const d = Math.floor(mins / 1440), h = Math.floor((mins % 1440) / 60), m = mins % 60;
    const dur = d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
    const msg = `skill queue ends in ${dur}.`;
    addToast('Queue Warning', msg);
    pushNotification(p.characterId, 'queue-warning', { ...p, title: 'Queue running dry', message: p.message || msg });
  };
  const handleLiveQueueEmpty = (p) => {
    addToast('Queue Empty', p.characterName);
    pushNotification(p.characterId, 'queue-empty', { ...p, title: 'Queue empty', message: 'skill queue has no skills left.' });
  };

  useEffect(() => {
    if (!window.eveApi) return;
    const unsubs = [
      window.eveApi.onSkillCompleted(handleLiveSkillCompleted),
      window.eveApi.onWalletActivity(handleLiveWalletActivity),
      window.eveApi.onQueueWarning(handleLiveQueueWarning),
      window.eveApi.onQueueEmpty(handleLiveQueueEmpty),
    ];
    return () => unsubs.forEach(u => u());
  }, [selectedAccount?.characterId]);

  const addToast = (title, body) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [selectedAccount?.characterId, activeTab]);

  useEffect(() => {
    refreshUnseenCounts();
  }, []);

  const tabs = USER_TABS.filter((t) => !Array.isArray(settings?.enabledTabs) || settings.enabledTabs.includes(t));
  if (isDev) tabs.push('debug');

  useEffect(() => {
    if (!Array.isArray(settings?.enabledTabs)) return;
    if (USER_TABS.includes(activeTab) && !settings.enabledTabs.includes(activeTab)) {
      const fallback = USER_TABS.find((t) => settings.enabledTabs.includes(t)) || 'overview';
      setActiveTab(fallback);
    }
  }, [settings?.enabledTabs, activeTab]);

  const tabLock = settings?.tabsVerticalLock ? 'vertical' : settings?.tabsHorizontalLock ? 'horizontal' : 'auto';
  const tabShellLayout = tabLock === 'vertical'
    ? 'flex-1 flex flex-row overflow-hidden'
    : tabLock === 'horizontal'
      ? 'flex-1 flex flex-col overflow-hidden'
      : 'flex-1 flex flex-row md:flex-col overflow-hidden';
  const tabBarLayout = tabLock === 'vertical'
    ? 'flex flex-col border-r border-gray-700 bg-gray-800 shrink-0 tab-bar w-auto'
    : tabLock === 'horizontal'
      ? 'flex flex-row border-b border-gray-700 bg-gray-800 shrink-0 tab-bar w-auto'
      : 'flex flex-col md:flex-row border-r md:border-r-0 md:border-b border-gray-700 bg-gray-800 shrink-0 tab-bar w-auto';
  const tabBtnClass = (active) => {
    if (tabLock === 'vertical') {
      return `w-auto text-left px-4 py-3 text-sm font-medium capitalize transition-colors border-b border-gray-700 border-transparent ${
        active ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
      }`;
    }
    if (tabLock === 'horizontal') {
      return `w-auto text-left px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 border-transparent ${
        active ? 'text-blue-400 border-blue-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
      }`;
    }
    return `w-auto text-left px-4 py-3 md:py-2 text-sm font-medium capitalize transition-colors border-b border-gray-700 md:border-b-0 md:border-l-2 border-transparent ${
      active ? 'text-blue-400 border-blue-400 bg-gray-700 md:border-l-2' : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
    }`;
  };

  const renderContent = () => {
    if (activeTab === 'create-plan') return <CreatePlan account={selectedAccount} onClose={() => setActiveTab('plans')} editingPlan={editingPlan} />;
    if (activeTab === 'settings') return <SettingsTab onClose={() => setActiveTab('overview')} onSettingsChange={setSettings} />;
    if (activeTab === 'debug') return <DebugTab />;
    if (!selectedAccount) return <p className="text-gray-500">Select a character from the sidebar.</p>;
    
    switch (activeTab) {
      case 'overview': return <Overview account={selectedAccount} unseenNotifications={unseenNotifications} lastViewedTime={lastViewedByChar[selectedAccount.characterId] || 0} />;
      case 'skills': return <Skills account={selectedAccount} />;
      case 'wallet': return <Wallet account={selectedAccount} />;
      case 'assets': return <Assets account={selectedAccount} />;
      case 'clones': return <Clones account={selectedAccount} />;
      case 'notifications': return <Notifications account={selectedAccount} />;
      case 'notes': return <Notes account={selectedAccount} />;
      case 'plans': return <SkillPlans account={selectedAccount} onCreatePlan={() => { setEditingPlan(null); setActiveTab('create-plan'); }} onEditPlan={(plan) => { setEditingPlan(plan); setActiveTab('create-plan'); }} />;
      default: return <p className="text-gray-400">Unknown tab.</p>;
    }
  };

  return (
    <div className="relative flex h-screen flex-col bg-gray-900 text-gray-100 min-w-[700px]">
      <OceanWaves />
      <div className="relative z-10 flex flex-1 flex-col min-h-0">
        <Topbar onOpenSettings={() => setActiveTab('settings')} isSettingsOpen={activeTab === 'settings'} />
        <SyncIndicator />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar selectedAccount={selectedAccount} onSelect={handleSelectAccount} unseenCounts={unseenCounts} />
          <main className={tabShellLayout}>
            <div className={tabBarLayout}>
              {tabs.map((tab) => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)}
                  className={tabBtnClass(activeTab === tab)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div ref={mainRef} className="flex-1 overflow-y-auto p-4 tab-shell">
              <div className="relative z-10">{renderContent()}</div>
            </div>
          </main>
        </div>
        <BottomBar />
      </div>
      {/* Global UI Elements */}
      <ToastContainer toasts={toasts} />
      <UpdateDialog />
      <ChangelogDialog />
    </div>
  );
}
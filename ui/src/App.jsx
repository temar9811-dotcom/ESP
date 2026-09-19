// ui/src/App.jsx | Version: 2.0
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
import Notes from './components/character/Notes';
import SkillPlans from './components/character/SkillPlans';
import CreatePlan from './components/character/CreatePlan';
import UpdateDialog from './components/UpdateDialog';
import ChangelogDialog from './components/ChangelogDialog';
import { applyTheme, applyTextScale } from './theme';

export default function App() {
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const mainRef = useRef(null);
  const [toasts, setToasts] = useState([]);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    const host = window.location.hostname;
    setIsDev(host === 'localhost' || host === '127.0.0.1');
  }, []);

  useEffect(() => {
    if (!window.eveApi?.getSettings) return;
    window.eveApi.getSettings().then((s) => {
      if (s?.theme) applyTheme(s.theme);
      applyTextScale(!!s?.biggerText);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!window.eveApi) return;
    const unsubs = [
      window.eveApi.onSkillCompleted((p) => addToast('Skill Complete', p.skillName)),
      window.eveApi.onWalletActivity((p) => addToast('Wallet Activity', `${p.amount} ISK`)),
      window.eveApi.onQueueWarning((p) => addToast('Queue Warning', p.message)),
      window.eveApi.onQueueEmpty((p) => addToast('Queue Empty', p.characterName)),
    ];
    return () => unsubs.forEach(u => u());
  }, []);

  const addToast = (title, body) => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, title, body }]);
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
  };

  useEffect(() => {
    if (mainRef.current) mainRef.current.scrollTop = 0;
  }, [selectedAccount?.characterId, activeTab]);

  const tabs = ['overview', 'skills', 'wallet', 'assets', 'clones', 'notes', 'plans'];
  if (isDev) tabs.push('debug');

  const renderContent = () => {
    if (activeTab === 'create-plan') return <CreatePlan account={selectedAccount} onClose={() => setActiveTab('plans')} />;
    if (activeTab === 'settings') return <SettingsTab onClose={() => setActiveTab('overview')} />;
    if (activeTab === 'debug') return <DebugTab />;
    if (!selectedAccount) return <p className="text-gray-500">Select a character from the sidebar.</p>;
    
    switch (activeTab) {
      case 'overview': return <Overview account={selectedAccount} />;
      case 'skills': return <Skills account={selectedAccount} />;
      case 'wallet': return <Wallet account={selectedAccount} />;
      case 'assets': return <Assets account={selectedAccount} />;
      case 'clones': return <Clones account={selectedAccount} />;
      case 'notes': return <Notes account={selectedAccount} />;
      case 'plans': return <SkillPlans account={selectedAccount} onCreatePlan={() => setActiveTab('create-plan')} />;
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
          <Sidebar selectedAccount={selectedAccount} onSelect={setSelectedAccount} />
          <main className="flex-1 flex flex-row md:flex-col overflow-hidden">
            <div className="flex flex-col md:flex-row border-r md:border-r-0 md:border-b border-gray-700 bg-gray-800 shrink-0 tab-bar w-auto">
              {tabs.map((tab) => (
                <button 
                  key={tab} 
                  onClick={() => setActiveTab(tab)}
                  className={`w-auto text-left px-4 py-3 md:py-2 text-sm font-medium capitalize transition-colors border-b border-gray-700 md:border-b-0 md:border-l-2 border-transparent ${
                    activeTab === tab 
                      ? 'text-blue-400 border-blue-400 bg-gray-700 md:border-l-2' 
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/50'
                  }`}
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
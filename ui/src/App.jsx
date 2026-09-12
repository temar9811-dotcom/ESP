// File: ui/src/App.jsx | Version: 1.0
import React, { useState, useEffect, useRef } from 'react';
import Topbar from './components/Topbar';
import Sidebar from './components/Sidebar';
import ToastContainer from './components/global/ToastContainer';
import SyncIndicator from './components/global/SyncIndicator';
import TestPanel from './components/global/TestPanel';
import Overview from './components/character/Overview';
import Skills from './components/character/Skills';
import Wallet from './components/character/Wallet';
import Assets from './components/character/Assets';
import Clones from './components/character/Clones';
import Notes from './components/character/Notes';
import SkillPlans from './components/character/SkillPlans';

export default function App() {
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const mainRef = useRef(null);
  const [toasts, setToasts] = useState([]);

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
  }, [selectedId, activeTab]);

  const tabs = ['overview', 'skills', 'wallet', 'assets', 'clones', 'notes', 'plans'];

  const renderContent = () => {
    if (!selectedId) return <p className="text-gray-500">Select a character from the sidebar.</p>;
    switch (activeTab) {
      case 'overview': return <Overview characterId={selectedId} />;
      case 'skills': return <Skills characterId={selectedId} />;
      case 'wallet': return <Wallet characterId={selectedId} />;
      case 'assets': return <Assets characterId={selectedId} />;
      case 'clones': return <Clones characterId={selectedId} />;
      case 'notes': return <Notes characterId={selectedId} />;
      case 'plans': return <SkillPlans characterId={selectedId} />;
      default: return <p className="text-gray-400">Unknown tab.</p>;
    }
  };

  return (
    <div className="flex h-screen flex-col bg-gray-900 text-gray-100 min-w-[700px]">
      <Topbar />
      <SyncIndicator />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar selectedId={selectedId} onSelect={setSelectedId} />
        <main className="flex-1 flex flex-col overflow-hidden">
          {selectedId && (
            <div className="flex border-b border-gray-700 bg-gray-800 shrink-0">
              {tabs.map((tab) => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-sm font-medium capitalize transition-colors ${
                    activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400 bg-gray-700' : 'text-gray-400 hover:text-gray-200'
                  }`}>{tab}</button>
              ))}
            </div>
          )}
          <div ref={mainRef} className="flex-1 overflow-y-auto p-4">
            {renderContent()}
          </div>
        </main>
      </div>
      <ToastContainer toasts={toasts} />
      <TestPanel />
    </div>
  );
}
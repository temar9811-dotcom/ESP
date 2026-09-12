// File: ui/src/components/character/Overview.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function Overview({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [skills, setSkills] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [corp, setCorp] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const [skillData, walletData, corpData] = await Promise.all([
          window.eveApi.getCharacterSkills(characterId),
          window.eveApi.getCharacterWallet(characterId),
          window.eveApi.getCorpInfo(characterId)
        ]);
        if (isMounted) {
          setSkills(skillData);
          setWallet(walletData);
          setCorp(corpData);
        }
      } catch (err) {
        console.error('Failed to load overview:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [characterId]);

  if (loading) return <div className="p-4 text-gray-400">Loading overview...</div>;

  const activeSkill = skills?.queue?.[0];
  const queueLength = skills?.queue?.length || 0;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Active Skill</h2>
        <p className="text-gray-300">{activeSkill ? activeSkill.name : 'No active skill'}</p>
        <div className="w-full bg-gray-700 rounded-full h-2.5 mt-3">
          <div 
            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
            style={{ width: `${activeSkill?.progress || 0}%` }}
          ></div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Queue length: {queueLength} skills</p>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Wallet Balance</h2>
          <p className="text-2xl font-mono text-green-400">
            {wallet?.balance ? `${Number(wallet.balance).toLocaleString()} ISK` : '0 ISK'}
          </p>
        </div>
        
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Corporation</h2>
          <p className="text-gray-300">{corp?.corporation_name || 'Unknown'}</p>
          <p className="text-sm text-gray-400">{corp?.alliance_name || 'No Alliance'}</p>
        </div>
      </div>
      
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Location & Ship</h2>
        <p className="text-gray-400 italic">Location and ship data require additional ESI scopes/endpoints not yet wired in preload.js.</p>
      </div>
    </div>
  );
}
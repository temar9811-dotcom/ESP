// File: ui/src/components/character/Wallet.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function Wallet({ characterId }) {
  const [loading, setLoading] = useState(true);
  const [wallet, setWallet] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchWallet = async () => {
      setLoading(true);
      try {
        const data = await window.eveApi.getCharacterWallet(characterId);
        if (isMounted) setWallet(data);
      } catch (err) {
        console.error('Failed to load wallet:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchWallet();
    return () => { isMounted = false; };
  }, [characterId]);

  if (loading) return <div className="p-4 text-gray-400">Loading wallet...</div>;

  const journal = wallet?.journal?.slice(0, 7) || [];
  const transactions = wallet?.transactions || [];

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Balance</h2>
        <p className="text-3xl font-mono text-green-400">
          {wallet?.balance ? `${Number(wallet.balance).toLocaleString()} ISK` : '0 ISK'}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">7-Day Journal</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {journal.length === 0 ? (
              <p className="text-gray-500 italic">No recent journal entries.</p>
            ) : (
              journal.map((entry, idx) => (
                <div key={idx} className="flex justify-between text-xs border-b border-gray-700 pb-1">
                  <span className="text-gray-300 truncate mr-2">{entry.description}</span>
                  <span className={entry.amount > 0 ? 'text-green-400' : 'text-red-400'}>
                    {entry.amount > 0 ? '+' : ''}{Number(entry.amount).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Transactions</h2>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {transactions.length === 0 ? (
              <p className="text-gray-500 italic">No recent transactions.</p>
            ) : (
              transactions.map((tx, idx) => (
                <div key={idx} className="flex justify-between text-xs border-b border-gray-700 pb-1">
                  <span className="text-gray-300 truncate mr-2">{tx.type_name || 'Item'}</span>
                  <span className="text-gray-400">{Number(tx.unit_price).toLocaleString()} ISK</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
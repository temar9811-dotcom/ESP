// ui/src/components/character/Wallet.jsx | Version: 1.8
import React, { useState, useEffect } from 'react';

function formatISK(amount) {
  const n = Number(amount || 0); const abs = Math.abs(n);
  if (abs >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 10000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}
function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function JournalRow({ entry }) {
  const positive = Number(entry.amount || 0) >= 0;
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate">{entry.description || entry.ref_type || 'Unknown entry'}</span>
        <span className={`text-xs font-mono shrink-0 ${positive ? 'text-green-400' : 'text-red-400'}`}>{positive ? '+' : ''}{formatISK(entry.amount)}</span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-gray-500">
        <span className="truncate">{entry.first_party_id ? `Party: ${entry.first_party_id}` : 'Unknown party'}</span>
        <span className="shrink-0">{formatDate(entry.date)}</span>
      </div>
    </div>
  );
}

function TransRow({ entry }) {
  const total = (entry.quantity || 0) * (entry.unit_price || 0);
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate">{entry.type_name || `Type ID ${entry.type_id}`}</span>
        <span className="text-xs font-mono text-blue-400 shrink-0">{formatISK(total)}</span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-gray-500">
        <span className="truncate">Qty: {entry.quantity} @ {formatISK(entry.unit_price)}</span>
        <span className="shrink-0">{formatDate(entry.date)}</span>
      </div>
    </div>
  );
}

export default function Wallet({ account }) {
  const [loading, setLoading] = useState(true);
  const [walletData, setWalletData] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchWallet = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        const data = await window.eveApi.getWalletData(id);
        if (isMounted) setWalletData(data);
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'WALLET-UI', message: 'Failed to load wallet', data: { error: err?.message } });
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchWallet();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading wallet...</div>;

  const bal = Number(walletData?.balance || 0);
  const journal = (walletData?.journal || []).slice(0, 7);
  const transactions = (walletData?.transactions || []).slice(0, 10);

  // Calculate In/Out/Net locally from the journal
  let moneyIn = 0, moneyOut = 0;
  journal.forEach(e => {
    const amt = Number(e.amount || 0);
    if (amt > 0) moneyIn += amt; else moneyOut += Math.abs(amt);
  });
  const net = moneyIn - moneyOut;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Balance</h2>
        <p className="text-3xl font-mono text-green-400">{bal.toLocaleString()} ISK</p>
        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          <div> <p className="text-gray-500 text-xs uppercase">In</p> <p className="text-green-400 font-mono">{formatISK(moneyIn)}</p> </div>
          <div> <p className="text-gray-500 text-xs uppercase">Out</p> <p className="text-red-400 font-mono">{formatISK(moneyOut)}</p> </div>
          <div> <p className="text-gray-500 text-xs uppercase">Net</p> <p className={`${net >= 0 ? 'text-green-400' : 'text-red-400'} font-mono`}>{net >= 0 ? '+' : ''}{formatISK(net)}</p> </div>
        </div>
        {walletData?.fetchedAt && <p className="text-xs text-gray-500 mt-3">Updated: {formatDate(walletData.fetchedAt)}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">7-Day Journal</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {journal.length === 0 ? <p className="text-gray-500 italic">No recent journal entries.</p> : journal.map((entry, idx) => <JournalRow key={entry.id || idx} entry={entry} />)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Transactions</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {transactions.length === 0 ? <p className="text-gray-500 italic">No recent transactions.</p> : transactions.map((entry, idx) => <TransRow key={entry.transaction_id || idx} entry={entry} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
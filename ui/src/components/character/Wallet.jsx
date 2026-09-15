// File: ui/src/components/character/Wallet.jsx | Version: 1.5
import React, { useState, useEffect } from 'react';
const uiLog = (level, message, data) => { try { window.eveApi?.debugLog?.({ level, source: 'WALLET-UI', message, data }); } catch {} };
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
function EntryRow({ entry }) {
  const positive = Number(entry.amount || 0) >= 0;
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate">{entry.description || entry.category || 'Unknown entry'}</span>
        <span className={`text-xs font-mono shrink-0 ${positive ? 'text-green-400' : 'text-red-400'}`}>{positive ? '+' : ''}{formatISK(entry.amount)}</span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-gray-500">
        <span className="truncate">{entry.party || entry.category || 'Unknown party'}</span>
        <span className="shrink-0">{formatDate(entry.date)}</span>
      </div>
    </div>
  );
}
export default function Wallet({ account }) {
  const [loading, setLoading] = useState(true);
  const [walletDetails, setWalletDetails] = useState(null);
  useEffect(() => {
    let isMounted = true;
    const fetchWallet = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        uiLog('DEBUG', `Fetching wallet details for character ${id}`);
        const data = await window.eveApi.getCharacterWallet(id);
        uiLog('DEBUG', 'Received wallet data', { hasData: Boolean(data), pulling: data?.pulling });
        if (isMounted) setWalletDetails(data);
      } catch (err) {
        uiLog('ERROR', 'Failed to load wallet', { error: err?.message || String(err) });
      } finally {
        if (isMounted) setLoading(false);
      }
    };
    fetchWallet();
    return () => { isMounted = false; };
  }, [account?.characterId]);
  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  const walletBalance = Number(account.wallet || 0);
  const details = walletDetails?.data || null;
  const entries = details?.entries || [];
  const summary = details?.summary || null;
  const journal = entries.filter((e) => e.kind === 'journal').slice(0, 7);
  const transactions = entries.filter((e) => e.kind === 'transaction').slice(0, 10);
  if (loading) return <div className="p-4 text-gray-400">Loading wallet...</div>;
  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Balance</h2>
        <p className="text-3xl font-mono text-green-400">{walletBalance.toLocaleString()} ISK</p>
        {summary && (
          <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
            <div><p className="text-gray-500 text-xs uppercase">In</p><p className="text-green-400 font-mono">{formatISK(summary.moneyIn)}</p></div>
            <div><p className="text-gray-500 text-xs uppercase">Out</p><p className="text-red-400 font-mono">{formatISK(summary.moneyOut)}</p></div>
            <div><p className="text-gray-500 text-xs uppercase">Net</p><p className={`${summary.net >= 0 ? 'text-green-400' : 'text-red-400'} font-mono`}>{summary.net >= 0 ? '+' : ''}{formatISK(summary.net)}</p></div>
          </div>
        )}
        {walletDetails?.pulling && <p className="text-xs text-yellow-400 mt-3">Wallet data is still syncing. Pull in progress...</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">7-Day Journal</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {journal.length === 0 ? <p className="text-gray-500 italic">No recent journal entries.</p> : journal.map((entry, idx) => <EntryRow key={entry.id || idx} entry={entry} />)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Transactions</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {transactions.length === 0 ? <p className="text-gray-500 italic">No recent transactions.</p> : transactions.map((entry, idx) => <EntryRow key={entry.id || idx} entry={entry} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
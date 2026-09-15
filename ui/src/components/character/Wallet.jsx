// File: ui/src/components/character/Wallet.jsx | Version: 1.6
import React, { useState, useEffect } from 'react';

const fmtISK = (n) => { 
  n = Number(n||0); const a = Math.abs(n); 
  if(a>=1e9) return `${(n/1e9).toFixed(2)}B`; 
  if(a>=1e6) return `${(n/1e6).toFixed(2)}M`; 
  if(a>=1e3) return `${(n/1e3).toFixed(1)}K`; 
  return n.toLocaleString(); 
};
const fmtDate = (d) => d ? `${new Date(d).toLocaleDateString()} ${new Date(d).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}` : 'Unknown';

function JournalRow({ e }) {
  const pos = Number(e.amount||0) >= 0;
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate">{e.description || e.ref_type || 'Unknown'}</span>
        <span className={`text-xs font-mono shrink-0 ${pos?'text-green-400':'text-red-400'}`}>{pos?'+':''}{fmtISK(e.amount)}</span>
      </div>
      <div className="text-[11px] text-gray-500 truncate">{fmtDate(e.date)}</div>
    </div>
  );
}

function TransRow({ e }) {
  const total = (e.quantity||0) * (e.unit_price||0);
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate">Type ID: {e.type_id || 'Unknown'}</span>
        <span className="text-xs font-mono text-blue-400 shrink-0">{fmtISK(total)}</span>
      </div>
      <div className="text-[11px] text-gray-500 truncate">Qty: {e.quantity} @ {fmtISK(e.unit_price)} | {fmtDate(e.date)}</div>
    </div>
  );
}

export default function Wallet({ account }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    const fetch = async () => {
      setLoading(true);
      try {
        if (window.eveApi.getWalletData) {
          const d = await window.eveApi.getWalletData(account.characterId);
          if (isMounted) setData(d);
        }
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'WALLET-UI', message: 'Failed to load wallet', data: { error: err?.message } });
      } finally { if (isMounted) setLoading(false); }
    };
    if (account?.characterId) fetch();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading wallet...</div>;

  const bal = Number(data?.balance || 0);
  const jour = (data?.journal || []).slice(0, 7);
  const trans = (data?.transactions || []).slice(0, 10);

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Balance</h2>
        <p className="text-3xl font-mono text-green-400">{bal.toLocaleString()} ISK</p>
        {data?.fetchedAt && <p className="text-xs text-gray-500 mt-2">Updated: {fmtDate(new Date(data.fetchedAt).toISOString())}</p>}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Journal</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {jour.length === 0 ? <p className="text-gray-500 italic">No recent entries.</p> : jour.map((e, i) => <JournalRow key={e.id||i} e={e} />)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Transactions</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {trans.length === 0 ? <p className="text-gray-500 italic">No recent transactions.</p> : trans.map((e, i) => <TransRow key={e.transaction_id||i} e={e} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
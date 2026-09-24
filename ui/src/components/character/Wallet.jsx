// ui/src/components/character/Wallet.jsx | Version: 1.9
import React from 'react';
import { useCharacterSnapshot } from '../../hooks/useEveApi';
import { formatISK, formatTime } from '../../utils/format';

function JournalRow({ entry }) {
  const positive = Number(entry.amount || 0) >= 0;
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate wallet-main">{entry.description || entry.ref_type || 'Unknown entry'}</span>
        <span className={`text-xs font-mono shrink-0 ${positive ? 'text-green-400' : 'text-red-400'}`}>{positive ? '+' : ''}{formatISK(entry.amount)}</span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-gray-500 wallet-sub">
        <span className="truncate">{entry.party_name ? `Party: ${entry.party_name}` : 'Unknown party'}</span>
        <span className="shrink-0">{formatTime(entry.date)}</span>
      </div>
    </div>
  );
}

function TransRow({ entry }) {
  const total = (entry.quantity || 0) * (entry.unit_price || 0);
  return (
    <div className="border-b border-gray-700 pb-2">
      <div className="flex justify-between gap-2">
        <span className="text-xs text-gray-200 truncate wallet-main">{entry.type_name || `Type ID ${entry.type_id}`}</span>
        <span className="text-xs font-mono text-blue-400 shrink-0">{formatISK(total)}</span>
      </div>
      <div className="flex justify-between gap-2 text-[11px] text-gray-500 wallet-sub">
        <span className="truncate">Qty: {entry.quantity} @ {formatISK(entry.unit_price)}</span>
        <span className="shrink-0">{formatTime(entry.date)}</span>
      </div>
    </div>
  );
}

export default function Wallet({ account }) {
  const snapshot = useCharacterSnapshot(account?.characterId);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (!snapshot?.wallet) return <div className="p-4 text-gray-400">Loading wallet...</div>;

  const wallet = snapshot.wallet;
  const journal = wallet.journal || [];
  const transactions = wallet.transactions || [];

  const moneyIn = wallet.inOutNet7d?.in || 0;
  const moneyOut = wallet.inOutNet7d?.out || 0;
  const net = wallet.inOutNet7d?.net ?? (moneyIn - moneyOut);

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Balance</h2>
        <p className="text-3xl font-mono text-green-400">{wallet.balance.toLocaleString()} ISK</p>
        <div className="grid grid-cols-3 gap-3 mt-4 text-sm">
          <div> <p className="text-gray-500 text-xs uppercase">7d In</p> <p className="text-green-400 font-mono">{formatISK(moneyIn)}</p> </div>
          <div> <p className="text-gray-500 text-xs uppercase">7d Out</p> <p className="text-red-400 font-mono">{formatISK(moneyOut)}</p> </div>
          <div> <p className="text-gray-500 text-xs uppercase">7d Net</p> <p className={`${net >= 0 ? 'text-green-400' : 'text-red-400'} font-mono`}>{net >= 0 ? '+' : ''}{formatISK(net)}</p> </div>
        </div>
        {wallet.fetchedAt && <p className="text-xs text-gray-500 mt-3">Updated: {formatTime(wallet.fetchedAt)}</p>}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Journal</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {journal.length === 0 ? <p className="text-gray-500 italic">No journal entries.</p> : journal.map((entry, idx) => <JournalRow key={entry.id || idx} entry={entry} />)}
          </div>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-3">Recent Transactions</h2>
          <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
            {transactions.length === 0 ? <p className="text-gray-500 italic">No transactions.</p> : transactions.map((entry, idx) => <TransRow key={entry.transaction_id || idx} entry={entry} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
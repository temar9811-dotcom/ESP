// File: ui/src/components/global/BottomBar.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

const PULLERS = [
  { key: 'char-data', label: 'Char' },
  { key: 'skills-data', label: 'Skills' },
  { key: 'wallet-data', label: 'Wallet' },
  { key: 'assets-data', label: 'Assets' },
  { key: 'clones-data', label: 'Clones' },
];

const fmtCountdown = (ms) => {
  if (ms == null) return '…';
  if (ms <= 0) return 'now';
  const m = Math.floor(ms / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return `${m}m ${s}s`;
};

const fmtEveTime = (ts) => {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}.${p(d.getUTCMonth() + 1)}.${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
};

export default function BottomBar() {
  const [now, setNow] = useState(Date.now());
  const [esi, setEsi] = useState(null);
  const [timers, setTimers] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!window.eveApi) return;
    let alive = true;
    const fetchEsi = async () => {
      try { const s = await window.eveApi.getEsiStatus(); if (alive) setEsi(s); } catch {}
    };
    fetchEsi();
    const iv = setInterval(fetchEsi, 15000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  useEffect(() => {
    if (!window.eveApi) return;
    let alive = true;
    const fetchTimers = async () => {
      try { const t = await window.eveApi.getEsiTimers(); if (alive) setTimers(t); } catch {}
    };
    fetchTimers();
    const iv = setInterval(fetchTimers, 10000);
    return () => { alive = false; clearInterval(iv); };
  }, []);

  const esiOk = esi?.ok;
  const dotClass = esiOk ? 'bg-green-500' : (esi && !esiOk) ? 'bg-red-500' : 'bg-gray-500';

  return (
    <div className="flex items-center justify-between h-8 px-3 shrink-0 border-t border-gray-700 bg-gray-800 text-[11px] bottom-bar">
      <div className="flex items-center gap-3" title="Next scheduled ESI pulls">
        <svg className="w-4 h-4 animate-spin text-blue-400" viewBox="0 0 24 24" fill="none">
          <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
          <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        </svg>
        {PULLERS.map((p) => {
          const entry = timers?.[p.key];
          const left = entry?.next ? entry.next - now : null;
          return (
            <span key={p.key} className="whitespace-nowrap">
              <span className="text-gray-300 font-medium">{p.label}</span>{' '}
              <span className="text-gray-500">{fmtCountdown(left)}</span>
            </span>
          );
        })}
      </div>

      <div className="flex items-center gap-4">
        <span className="flex items-center gap-1.5 text-gray-300 whitespace-nowrap" title="EVE Time (UTC)">
          <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" strokeLinecap="round" />
          </svg>
          <span className="font-mono">{fmtEveTime(now)}</span>
        </span>
        <div className="flex items-center gap-2 text-gray-300" title={esiOk ? 'ESI online' : (esi?.error || 'Checking ESI…')}>
          <span className={`inline-block w-2 h-2 rounded-full ${dotClass} ${!esi ? 'animate-pulse' : ''}`}></span>
          <span className="whitespace-nowrap">
            ESI: {esiOk ? `Online · ${(esi.players ?? 0).toLocaleString()} pilots` : (esi ? 'Offline' : 'Checking…')}
          </span>
        </div>
      </div>
    </div>
  );
}
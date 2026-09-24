// ui/src/components/character/Overview.jsx | Version: 1.13
import React, { useState, useEffect } from 'react';

function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const s = Math.floor(ms / 1000);
  const d = Math.floor((s % 86400) / 3600), h = Math.floor((s % 3600) / 60), m = s % 60;
  const parts = [];
  if (d > 0) parts.push(`${d}d`); if (h > 0) parts.push(`${h}h`); if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function formatIskAmount(amount) {
  const n = Math.abs(Number(amount || 0));
  const sign = Number(amount || 0) >= 0 ? '+' : '-';
  return `${sign}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ISK`;
}

const TYPE_META = {
  'skill-complete': { label: 'Skill Complete', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  'queue-warning': { label: 'Queue Warning', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'queue-empty': { label: 'Queue Empty', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  'wallet-activity': { label: 'Wallet Activity', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
};
const DEFAULT_META = { label: 'Notification', color: 'text-gray-300', bg: 'bg-gray-500/10 border-gray-500/30' };

function NotificationRow({ entry }) {
  const meta = TYPE_META[entry.type] || DEFAULT_META;
  const body = entry.message || entry.title || 'Notification';
  return (
    <div className={`border rounded-md p-2 ${meta.bg}`}>
      <div className="flex justify-between gap-2">
        <span className={`text-xs font-semibold ${meta.color} shrink-0`}>{meta.label}</span>
        <span className="text-[11px] text-gray-500 shrink-0" title={formatTime(entry.timestamp)}>{timeAgo(entry.timestamp)}</span>
      </div>
      <p className="text-xs text-gray-200 mt-0.5 break-words">{
        entry.type === 'wallet-activity' && entry.amount != null
          ? `${entry.description || body} (${formatIskAmount(entry.amount)})`
          : body
      }</p>
    </div>
  );
}

function calculateSkillProgress(activeSkill) {
  if (!activeSkill) return 0;
  const now = Date.now();
  const start = activeSkill.start_date ? new Date(activeSkill.start_date).getTime() : 0;
  const finish = activeSkill.finish_date ? new Date(activeSkill.finish_date).getTime() : 0;
  if (!start || !finish || finish <= start) return 0;
  if (now >= finish) return 100;
  if (now <= start) return 0;
  return Math.min(100, Math.max(0, ((now - start) / (finish - start)) * 100));
}

export default function Overview({ account, unseenNotifications = [], lastViewedTime = 0 }) {
  const [cData, setCData] = useState(null);
  const [uNames, setUNames] = useState({});
  const [sNames, setSNames] = useState({});
  const [skData, setSkData] = useState(null);
  const [wData, setWData] = useState(null);
  const [clData, setClData] = useState(null);
  const [finishedSkills, setFinishedSkills] = useState([]);

  useEffect(() => {
    let isMounted = true;
    const fetchFinishedSkills = async () => {
      try {
        const id = account.characterId;
        const all = await window.eveApi.getAllNotifications(id);
        if (!all) return;
        const skills = all
          .filter(e => e.type === 'skill-complete')
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 5);
        if (isMounted) setFinishedSkills(skills);
      } catch {}
    };
    if (account?.characterId) fetchFinishedSkills();

    const fetchAll = async () => {
      try {
        const id = account.characterId;
        const [c, u, s, sk, w, cl] = await Promise.all([
          window.eveApi.getCharData(id),
          window.eveApi.getUniverseNames(),
          window.eveApi.getStructureNames(),
          window.eveApi.getSkillsData(id),
          window.eveApi.getWalletData(id),
          window.eveApi.getClonesData(id)
        ]);
        if (isMounted) { setCData(c); setUNames(u || {}); setSNames(s || {}); setSkData(sk); setWData(w); setClData(cl); }
      } catch (err) { window.eveApi?.debugLog?.({ level: 'ERROR', source: 'OVERVIEW', message: 'Failed to load', data: { error: err?.message } }); }
    };
    if (account?.characterId) fetchAll();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;

  const activeSkill = skData?.queue?.[0] || account.activeSkill;
  const queueLength = skData?.queue?.length || account.queue?.length || 0;
  const walletBalance = Number(wData?.balance ?? account.wallet ?? 0);
  const queueRemainingMs = account.queueRemainingMs || 0;
  const progress = calculateSkillProgress(activeSkill);

  const systemName = cData?.system_name || `System ${cData?.location?.solar_system_id || 'Unknown'}`;
  const corpName = uNames[cData?.corporation_id] || `Corp ${cData?.corporation_id || 'Unknown'}`;
  const allianceName = uNames[cData?.alliance_id] || (cData?.alliance_id ? `Alliance ${cData.alliance_id}` : 'No Alliance');

  const homeLoc = clData?.home_location;
  const homeName = homeLoc?.location_type === 'structure' ? (sNames[homeLoc.location_id]?.name || `Structure ${homeLoc.location_id}`) : (uNames[homeLoc?.location_id] || 'Unknown Station');
  const homeTypeLabel = homeLoc?.location_type === 'structure' ? 'Citadel' : 'Station';
  const jumpClones = clData?.jump_clones?.length || 0;

  const notifs = Array.isArray(unseenNotifications) ? [...unseenNotifications].sort((a, b) => b.timestamp - a.timestamp) : [];
  const lastViewed = Number(lastViewedTime) || 0;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Active Skill</h2>
        <p className="text-gray-300">{activeSkill ? `${activeSkill.skill_name || activeSkill.skillName} (L${activeSkill.finished_level ?? '?'} • ${progress.toFixed(1)}%)` : 'No active skill'}</p>
        <div className="w-full bg-gray-700 rounded-full h-2.5 mt-3 overflow-hidden">
          <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${progress}%` }}></div>
        </div>
        <p className="text-xs text-gray-400 mt-1">Queue: {queueLength} skills {queueRemainingMs > 0 && `• ${formatQueueTime(queueRemainingMs)}`}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Wallet Balance</h2>
          <p className="text-2xl font-mono text-green-400">{walletBalance.toLocaleString()} ISK</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Corporation</h2>
          <p className="text-gray-300">{corpName}</p>
          <p className="text-sm text-gray-400">{allianceName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Location & Ship</h2>
          <p className="text-gray-300">{systemName}</p>
          <p className="text-sm text-gray-400 mt-1">{account.shipName || 'Unknown'} {account.shipType ? `(${account.shipType})` : ''}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Clones</h2>
          <p className="text-gray-300">Home: {homeTypeLabel} - {homeName}</p>
          <p className="text-sm text-gray-400 mt-1">Jump Clones: {jumpClones}</p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Recently Finished Skills</h2>
        {finishedSkills.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No skills finished yet.</p>
        ) : (
          <div className="space-y-2">
            {finishedSkills.map((entry) => (
              <div key={entry.id || `${entry.type}-${entry.timestamp}`} className="flex justify-between gap-2 items-baseline border-b border-gray-700 pb-1.5">
                <span className="text-sm text-gray-300 truncate" title={entry.message || ''}>
                  {entry.skillName || entry.message || 'Skill'}
                  {entry.level != null && <span className="text-gray-500 ml-1">(L{entry.level})</span>}
                </span>
                <span className="text-[11px] text-gray-500 shrink-0" title={formatTime(entry.timestamp)}>{timeAgo(entry.timestamp)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-blue-500/40">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold text-gray-100">Notification History</h2>
          <span className="text-xs text-gray-500" title={`Last viewed: ${lastViewed ? formatTime(lastViewed) : 'never'}`}>
            {lastViewed ? `Since ${timeAgo(lastViewed)}` : 'No previous visit'}
          </span>
        </div>
        {notifs.length === 0 ? (
          <p className="text-sm text-gray-500 italic">
            No notifications since your last visit.
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-400 mb-2">
              {notifs.length} notification{notifs.length === 1 ? '' : 's'} since you last checked{lastViewed ? ` (${timeAgo(lastViewed)})` : ''}.
            </p>
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {notifs.map((entry) => <NotificationRow key={entry.id || `${entry.type}-${entry.timestamp}`} entry={entry} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
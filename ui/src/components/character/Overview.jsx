// ui/src/components/character/Overview.jsx | Version: 1.15
import React, { useEffect, useState } from 'react';
import { useCharacterSnapshot } from '../../hooks/useEveApi';
import { formatQueueTime, formatTime, timeAgo, formatIskAmount } from '../../utils/format';

const TYPE_META = {
  'skill-complete': { label: 'Skill Complete', color: 'text-green-400', bg: 'bg-green-500/10 border-green-500/30' },
  'queue-warning': { label: 'Queue Warning', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  'queue-empty': { label: 'Queue Empty', color: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/30' },
  'wallet-activity': { label: 'Wallet Activity', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/30' },
};
const DEFAULT_META = { label: 'Notification', color: 'text-gray-300', bg: 'bg-gray-500/10 border-gray-500/30' };

function remainingSpFor(activeSkill, now) {
  if (!activeSkill) return null;
  const levelStart = Number(activeSkill.level_start_sp);
  const levelEnd = Number(activeSkill.level_end_sp);
  const trainingStart = Number(activeSkill.training_start_sp);
  const start = activeSkill.start_date ? new Date(activeSkill.start_date).getTime() : 0;
  const finish = activeSkill.finish_date ? new Date(activeSkill.finish_date).getTime() : 0;
  if (!Number.isFinite(levelStart) || !Number.isFinite(levelEnd) || !Number.isFinite(trainingStart)) return null;
  if (levelEnd <= levelStart || levelEnd <= trainingStart) return null;
  if (now >= finish) return 0;
  const frac = Math.min(1, Math.max(0, (now - start) / (finish - start)));
  const currentSp = trainingStart + frac * (levelEnd - trainingStart);
  return Math.max(0, Math.round(levelEnd - currentSp));
}

function SkillBar({ activeSkill, progress }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!activeSkill) return undefined;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [activeSkill]);

  const finish = activeSkill ? new Date(activeSkill.finish_date).getTime() : 0;
  const remaining = activeSkill && Number.isFinite(finish) ? Math.max(0, finish - now) : 0;
  const remainingSp = remainingSpFor(activeSkill, now);
  const pct = Math.min(100, Math.max(0, Number(progress) || 0));

  return (
    <div className="relative pt-4 pb-4 mt-2">
      <div className="w-full bg-gray-700 rounded-full h-2.5 overflow-hidden">
        <div className="bg-green-500 h-2.5 rounded-full transition-all duration-500" style={{ width: `${pct}%` }}></div>
      </div>
      <span className="absolute top-0 right-0 text-[11px] font-mono text-gray-300">
        {remaining > 0 ? formatQueueTime(remaining) : 'Done'}
      </span>
      <span className="absolute bottom-0 right-0 text-[11px] font-mono text-gray-400">
        {remainingSp != null ? `${remainingSp.toLocaleString()} SP left` : ''}
      </span>
    </div>
  );
}

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

export default function Overview({ account, unseenNotifications = [], lastViewedTime = 0 }) {
  const snapshot = useCharacterSnapshot(account?.characterId);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (!snapshot?.overview) return <div className="p-4 text-gray-400">Loading character data...</div>;

  const ov = snapshot.overview;
  const activeSkill = ov.activeSkill;
  const progress = Number(ov.progress || 0);
  const walletBalance = Number(ov.walletBalance ?? 0);
  const finishedSkills = Array.isArray(ov.finishedSkills) ? ov.finishedSkills : [];

  const notifs = Array.isArray(unseenNotifications) ? [...unseenNotifications].sort((a, b) => b.timestamp - a.timestamp) : [];
  const lastViewed = Number(lastViewedTime) || 0;

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Active Skill</h2>
        <p className="text-gray-300">{activeSkill ? `${activeSkill.skill_name || activeSkill.skillName} (L${activeSkill.finished_level ?? '?'} • ${progress.toFixed(1)}%)` : 'No active skill'}</p>
        <SkillBar activeSkill={activeSkill} progress={progress} />
        <p className="text-xs text-gray-400 mt-1">Queue: {ov.queueLength} skills {ov.queueRemainingMs > 0 && `• ${formatQueueTime(ov.queueRemainingMs)}`}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Wallet Balance</h2>
          <p className="text-2xl font-mono text-green-400">{walletBalance.toLocaleString()} ISK</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Corporation</h2>
          <p className="text-gray-300">{ov.corpName}</p>
          <p className="text-sm text-gray-400">{ov.allianceName}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Location & Ship</h2>
          <p className="text-gray-300">{ov.systemName}</p>
          <p className="text-sm text-gray-400 mt-1">{ov.shipName || 'Unknown'} {ov.shipType ? `(${ov.shipType})` : ''}</p>
        </div>
        <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
          <h2 className="text-lg font-semibold text-gray-100 mb-2">Clones</h2>
          <p className="text-gray-300">Home: {ov.homeLocationType} - {ov.homeLocationName || 'Unknown'}</p>
          <p className="text-sm text-gray-400 mt-1">Jump Clones: {ov.jumpCloneCount}</p>
        </div>
      </div>

      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <h2 className="text-lg font-semibold text-gray-100 mb-2">Recently Finished Skills</h2>
        {finishedSkills.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No skills finished yet.</p>
        ) : (
          <div className="space-y-2">
            {finishedSkills.map((entry, idx) => (
              <div key={idx} className="flex justify-between gap-2 items-baseline border-b border-gray-700 pb-1.5">
                <span className="text-sm text-gray-300 truncate">
                  {entry.skillName || 'Skill'}
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
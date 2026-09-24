// ui/src/components/character/Notifications.jsx
// VERSION: 1.1
import React, { useState, useEffect } from 'react';

const MAX_DISPLAY = 50;
const TOP_N = 10;

function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso || '';
  const now = Date.now();
  const diff = now - d.getTime();
  if (diff < 60 * 1000) return 'just now';
  if (diff < 3600 * 1000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400 * 1000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 7 * 86400 * 1000) return `${Math.floor(diff / 86400000)}d ago`;
  return d.toLocaleDateString();
}

function TypeBadge({ type }) {
  const label = (type || 'Unknown')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return <span className="px-2 py-0.5 rounded bg-gray-700 text-blue-400 text-xs font-medium uppercase tracking-wide">{label}</span>;
}

function senderDescription(n, names) {
  const name = names[n.sender_id];
  if (name) {
    const kind = n.sender_type === 'corporation' ? 'Corp'
      : n.sender_type === 'alliance' ? 'Alliance'
      : n.sender_type === 'faction' ? 'Faction'
      : n.sender_type === 'system' ? 'System'
      : n.sender_type === 'structure' ? 'Structure'
      : 'Character';
    return { text: name, prefix: kind };
  }
  return { text: `#${n.sender_id}`, prefix: n.sender_type || 'Unknown' };
}

function NotificationRow({ n, names }) {
  const [expanded, setExpanded] = useState(false);
  const sender = senderDescription(n, names);
  return (
    <div className={`p-3 rounded border ${n.is_read ? 'bg-gray-800/60 border-gray-700/60' : 'bg-gray-800 border-blue-500/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={n.type} />
            <span className="text-xs text-gray-400"><span className="text-gray-500">{sender.prefix}:</span> {sender.text}</span>
            {!n.is_read && <span className="text-xs font-semibold text-blue-400">NEW</span>}
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{expanded ? n.text : (n.text?.length > 220 ? n.text.slice(0, 220) + '...' : n.text)}</p>
          {n.text?.length > 220 && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">{formatTime(n.date)}</span>
      </div>
    </div>
  );
}

export default function Notifications({ account }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [names, setNames] = useState({});

  useEffect(() => {
    if (!window.eveApi.getUniverseNames) return;
    window.eveApi.getUniverseNames().then((u) => setNames(u || {})).catch(() => {});
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      setLoading(true);
      try {
        const id = account?.characterId;
        if (!id) return;
        if (window.eveApi.getNotificationsData) {
          const d = await window.eveApi.getNotificationsData(id);
          if (isMounted) setData(d);
        }
      } catch (err) {
        window.eveApi?.debugLog?.({ level: 'ERROR', source: 'NOTIFS-UI', message: 'Failed to load in-game notifications', data: { error: err?.message } });
      } finally { if (isMounted) setLoading(false); }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [account?.characterId]);

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;
  if (loading) return <div className="p-4 text-gray-400">Loading notifications...</div>;

  const notifications = data?.notifications || [];
  const list = notifications.slice(0, MAX_DISPLAY);
  const top = list.slice(0, TOP_N);
  const rest = list.slice(TOP_N);
  const unseen = notifications.filter((n) => !n.is_read).length;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-100">In-Game Notifications</h2>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {unseen > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">{unseen} new</span>}
            <span>{list.length}/{notifications.length} shown</span>
            {data?.fetchedAt && <span>Updated: {new Date(data.fetchedAt).toLocaleString()}</span>}
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">Latest {MAX_DISPLAY} notifications from EVE Online. The most recent {TOP_N} are expanded below; older ones are scrollable.</p>

        {list.length === 0 ? (
          <p className="text-gray-500 italic">No notifications fetched yet. Try a Force Pull from the debug tab if data is missing.</p>
        ) : (
          <>
            <div className="space-y-2">
              {top.map((n) => <NotificationRow key={n.notification_id} n={n} names={names} />)}
            </div>
            {rest.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Earlier ({rest.length})</p>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {rest.map((n) => <NotificationRow key={n.notification_id} n={n} names={names} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
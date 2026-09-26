// ui/src/components/character/Notifications.jsx
// VERSION: 1.2
import React from 'react';
import { useCharacterSnapshot } from '../../hooks/useEveApi';
import { timeAgo } from '../../utils/format';

const MAX_DISPLAY = 50;
const TOP_N = 10;

function TypeBadge({ type }) {
  const label = (type || 'Unknown')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2');
  return <span className="px-2 py-0.5 rounded bg-gray-700 text-blue-400 text-xs font-medium uppercase tracking-wide">{label}</span>;
}

function NotificationRow({ n }) {
  const [expanded, setExpanded] = React.useState(false);
  const senderText = n.sender_name && n.sender_name !== `#${n.sender_id}` ? n.sender_name : `#${n.sender_id}`;
  const bodyText = (n.resolvedText || n.text || '').trim();
  return (
    <div className={`p-3 rounded border ${n.is_read ? 'bg-gray-800/60 border-gray-700/60' : 'bg-gray-800 border-blue-500/40'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TypeBadge type={n.type} />
            <span className="text-xs text-gray-400"><span className="text-gray-500">{n.sender_kind}:</span> {senderText}</span>
            {!n.is_read && <span className="text-xs font-semibold text-blue-400">NEW</span>}
          </div>
          <p className="text-sm text-gray-300 whitespace-pre-wrap break-words">{expanded ? bodyText : (bodyText.length > 220 ? bodyText.slice(0, 220) + '...' : bodyText)}</p>
          {bodyText.length > 220 && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-400 hover:text-blue-300">
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
        <span className="text-xs text-gray-500 shrink-0 whitespace-nowrap">{timeAgo(n.date)}</span>
      </div>
    </div>
  );
}

export default function Notifications({ account }) {
  const snapshot = useCharacterSnapshot(account?.characterId);
  const [exportMsg, setExportMsg] = React.useState('');

  const handleExport = async () => {
    setExportMsg('Exporting…');
    try {
      const res = await window.eveApi.exportNotifications(account?.characterId);
      if (res && res.ok) {
        setExportMsg(
          `Exported ${res.count} notifications to ${res.path}` +
          (res.unresolved > 0
            ? ` — ${res.unresolvedTotal} unresolved ID(s) found, ${res.unresolved} queued for resolution.`
            : ' — all IDs resolved.')
        );
      } else {
        setExportMsg(res && res.canceled ? 'Export cancelled.' : (res?.error || 'Export failed.'));
      }
    } catch (err) {
      setExportMsg(err?.message || 'Export failed.');
    }
  };

  if (!account) return <div className="p-4 text-gray-400">No account selected.</div>;

  if (!snapshot?.notifications) {
    if (!snapshot) return <div className="p-4 text-gray-400">Loading notifications...</div>;
    const unavailable = snapshot.notifications?.unavailable;
    return (
      <div className="p-4 text-gray-400">
        {unavailable === 'no-scope'
          ? 'Notifications require the read_notifications scope. Re-add this character with Full scope.'
          : 'No notifications fetched yet. Try a Force Pull from the debug tab if data is missing.'}
      </div>
    );
  }
  const notifications = snapshot.notifications;

  const list = (notifications.items || []).slice(0, MAX_DISPLAY);
  const top = list.slice(0, TOP_N);
  const rest = list.slice(TOP_N);
  const unseen = notifications.unseen || 0;

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="bg-gray-800 p-4 rounded-lg border border-gray-700">
        <div className="flex justify-between items-center mb-1 flex-wrap gap-2">
          <h2 className="text-lg font-semibold text-gray-100">In-Game Notifications</h2>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            {unseen > 0 && <span className="px-2 py-0.5 rounded-full bg-blue-600 text-white font-semibold">{unseen} new</span>}
            <span>{list.length} shown</span>
            {snapshot.ts && <span>Updated: {new Date(snapshot.ts).toLocaleString()}</span>}
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <p className="text-xs text-gray-500">Latest {MAX_DISPLAY} notifications from EVE Online. The most recent {TOP_N} are expanded below; older ones are scrollable.</p>
          <button onClick={handleExport} className="px-3 py-1 text-sm bg-blue-600 hover:bg-blue-500 text-white rounded">
            Export to file…
          </button>
        </div>
        {exportMsg && <p className="mt-2 text-xs text-blue-300 break-words">{exportMsg}</p>}

        {list.length === 0 ? (
          <p className="text-gray-500 italic">No notifications yet.</p>
        ) : (
          <>
            <div className="space-y-2">
              {top.map((n) => <NotificationRow key={n.notification_id} n={n} />)}
            </div>
            {rest.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Earlier ({rest.length})</p>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {rest.map((n) => <NotificationRow key={n.notification_id} n={n} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
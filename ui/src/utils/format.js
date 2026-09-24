// ui/src/utils/format.js
// VERSION: 1.0

export function formatISK(amount) {
  const n = Number(amount || 0);
  const abs = Math.abs(n);
  if (abs >= 1000000000) return `${(n / 1000000000).toFixed(2)}B`;
  if (abs >= 1000000) return `${(n / 1000000).toFixed(2)}M`;
  if (abs >= 10000) return `${(n / 1000).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatIskAmount(amount) {
  const n = Math.abs(Number(amount || 0));
  const sign = Number(amount || 0) >= 0 ? '+' : '-';
  return `${sign}${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ISK`;
}

export function timeAgo(ts) {
  if (!ts) return '';
  const diff = Date.now() - Number(ts);
  if (diff < 0) return 'just now';
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function formatQueueTime(ms) {
  if (ms <= 0) return 'Complete';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}d`);
  if (h > 0) parts.push(`${h}h`);
  if (m > 0 || parts.length === 0) parts.push(`${m}m`);
  return parts.join(' ');
}
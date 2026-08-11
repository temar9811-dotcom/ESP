'use strict';

window.ESP = window.ESP || {};

ESP.escapeHtml = function (value) {
  return String(value ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[m]));
};

ESP.formatIsk = function (value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 2
  }).format(Number(value || 0));
};

ESP.formatNumber = function (value) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 0
  }).format(Number(value || 0));
};

ESP.formatOptionalNumber = function (value) {
  return value == null ? '—' : ESP.formatNumber(value);
};

ESP.formatDate = function (value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
};

ESP.remaining = function (dateStr) {
  if (!dateStr) return '';
  const target = new Date(dateStr).getTime();
  if (Number.isNaN(target)) return '';
  const ms = target - Date.now();
  if (ms <= 0) return 'complete';

  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const seconds = Math.floor((ms % 60000) / 1000);

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
};

ESP.formatDuration = function (ms) {
  const value = Number(ms);
  if (!Number.isFinite(value) || value <= 0) return '—';

  const totalMinutes = Math.floor(value / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
};

ESP.progressPercent = function (active) {
  if (!active || !active.start_date || !active.finish_date) return 0;
  const start = new Date(active.start_date).getTime();
  const finish = new Date(active.finish_date).getTime();
  const now = Date.now();
  if (Number.isNaN(start) || Number.isNaN(finish)) return 0;
  if (now <= start) return 0;
  if (now >= finish) return 100;
  return Math.round(((now - start) / (finish - start)) * 100);
};
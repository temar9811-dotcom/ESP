// ui/src/components/global/DebugTab.jsx
// VERSION: 1.2
import React, { useState } from 'react';
import { useDebugLogs, useDebugActions } from '../../hooks/useDebug';

export default function DebugTab() {
  const { logs, clearLogs } = useDebugLogs();
  const actions = useDebugActions();
  const [levelFilter, setLevelFilter] = useState('ALL');
  const [sourceFilter, setSourceFilter] = useState('ALL');
  const [running, setRunning] = useState(null);

  const levels = ['ALL', 'DEBUG', 'INFO', 'WARN', 'ERROR'];
  const sources = ['ALL', ...new Set(logs.map((l) => l.source).filter(Boolean))];

  const filteredLogs = logs.filter((log) => {
    if (levelFilter !== 'ALL' && log.level !== levelFilter) return false;
    if (sourceFilter !== 'ALL' && log.source !== sourceFilter) return false;
    return true;
  });

  const runAction = async (name) => {
    setRunning(name);
    try {
      await window.eveApi.debugRunAction(name, {});
    } catch (err) {
      console.error('Debug action failed:', err);
    } finally {
      setRunning(null);
    }
  };

  const copyLogs = () => {
    const text = filteredLogs.map((l) => {
      const ts = new Date(l.timestamp).toISOString();
      const data = l.data ? ` ${JSON.stringify(l.data)}` : '';
      return `[${ts}] [${l.level}] [${l.source}] ${l.message}${data}`;
    }).join('\n');
    navigator.clipboard.writeText(text);
  };

  const levelColors = {
    DEBUG: 'text-gray-400',
    INFO: 'text-blue-400',
    WARN: 'text-yellow-400',
    ERROR: 'text-red-400'
  };

  return (
    <div className="flex flex-col h-full bg-gray-900 text-gray-200">
      {/* Top Section: Test Buttons (Resizes as actions are added) */}
      <div className="bg-gray-800 border-b border-gray-700 p-3">
        <div className="flex flex-wrap gap-2">
          {actions.length === 0 ? (
            <span className="text-xs text-gray-500 italic">No debug actions registered.</span>
          ) : (
            actions.map((action) => (
              <button
                key={action.name}
                onClick={() => runAction(action.name)}
                disabled={running === action.name}
                className="px-3 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-200 rounded disabled:opacity-50"
                title={action.description}
              >
                {running === action.name ? 'Running...' : action.name}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Bottom Section: Log Controls & Resizable Log Window */}
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex gap-2 items-center p-3 bg-gray-800 border-b border-gray-700">
          <select
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600"
          >
            {levels.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="bg-gray-700 text-gray-200 text-xs px-2 py-1 rounded border border-gray-600"
          >
            {sources.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button onClick={clearLogs} className="px-3 py-1 text-xs bg-red-700 hover:bg-red-600 text-white rounded">
            Clear
          </button>
          <button onClick={copyLogs} className="px-3 py-1 text-xs bg-blue-700 hover:bg-blue-600 text-white rounded">
            Copy
          </button>
          <span className="text-xs text-gray-400 ml-auto">{filteredLogs.length} / {logs.length} logs</span>
        </div>

        <div className="flex-1 overflow-y-auto p-3 font-mono text-xs">
          {filteredLogs.length === 0 ? (
            <p className="text-gray-600">No logs to display.</p>
          ) : (
            filteredLogs.map((log, idx) => (
              <div key={idx} className="py-1 border-b border-gray-800">
                <span className="text-gray-500 mr-2">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <span className={`font-bold mr-2 ${levelColors[log.level] || 'text-gray-400'}`}>[{log.level}]</span>
                <span className="text-gray-400 mr-2">[{log.source}]</span>
                <span className="text-gray-200">{log.message}</span>
                {log.data && <span className="text-gray-500 ml-2">{JSON.stringify(log.data)}</span>}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
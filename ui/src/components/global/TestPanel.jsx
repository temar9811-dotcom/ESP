// File: ui/src/components/global/TestPanel.jsx | Version: 1.0
import React, { useState, useEffect } from 'react';

export default function TestPanel() {
  const [enabled, setEnabled] = useState(false);
  const [log, setLog] = useState([]);
  const [cmd, setCmd] = useState('');

  useEffect(() => {
    window.eveApi.testEnabled().then(setEnabled).catch(() => setEnabled(false));
  }, []);

  const runTest = async () => {
    if (!cmd.trim()) return;
    try {
      const res = await window.eveApi.testRun(cmd);
      setLog(prev => [`[OK] ${cmd}: ${JSON.stringify(res)}`, ...prev].slice(0, 20));
    } catch (err) {
      setLog(prev => [`[ERR] ${cmd}: ${err.message}`, ...prev].slice(0, 20));
    }
  };

  const clearCache = async (which) => {
    try {
      await window.eveApi.clearCache(which);
      setLog(prev => [`[OK] Cleared cache: ${which}`, ...prev].slice(0, 20));
    } catch (err) {
      setLog(prev => [`[ERR] Clear cache ${which}: ${err.message}`, ...prev].slice(0, 20));
    }
  };

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 left-4 w-80 bg-gray-800 border border-red-700 rounded-lg shadow-xl p-3 z-40">
      <h3 className="text-sm font-bold text-red-400 mb-2">Test Harness</h3>
      <div className="flex gap-2 mb-2">
        <input
          type="text"
          value={cmd}
          onChange={(e) => setCmd(e.target.value)}
          placeholder="test command..."
          className="flex-1 bg-gray-900 text-xs text-gray-200 px-2 py-1 rounded border border-gray-600"
        />
        <button onClick={runTest} className="px-2 py-1 text-xs bg-red-600 text-white rounded">Run</button>
      </div>
      <div className="flex gap-2 mb-2">
        <button onClick={() => clearCache('universe')} className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Clear Universe</button>
        <button onClick={() => clearCache('structures')} className="flex-1 px-2 py-1 text-xs bg-gray-700 text-gray-200 rounded hover:bg-gray-600">Clear Structures</button>
      </div>
      <div className="h-24 overflow-y-auto bg-gray-900 p-2 rounded text-xs font-mono text-gray-400 border border-gray-700">
        {log.length === 0 ? <p className="text-gray-600">No logs yet.</p> : log.map((l, i) => <p key={i}>{l}</p>)}
      </div>
    </div>
  );
}
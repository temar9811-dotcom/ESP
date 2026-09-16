// ui/src/components/ChangelogDialog.jsx
// VERSION: 1.0
import React, { useState, useEffect } from 'react';

export default function ChangelogDialog() {
  const [show, setShow] = useState(false);
  const [data, setData] = useState({ version: '', notes: '' });

  useEffect(() => {
    const unsub = window.eveApi.onShowChangelog((info) => {
      setData(info);
      setShow(true);
    });
    return unsub;
  }, []);

  if (!show) return null;

  const handleClose = async () => {
    setShow(false);
    await window.eveApi.closeChangelog();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 max-w-lg w-full shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">What's New in v{data.version}</h2>
        <div className="bg-gray-900 p-4 rounded text-sm text-gray-300 max-h-64 overflow-y-auto mb-6 whitespace-pre-wrap">
          {data.notes}
        </div>
        <div className="flex justify-end">
          <button onClick={handleClose} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
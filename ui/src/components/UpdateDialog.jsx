// ui/src/components/UpdateDialog.jsx
// VERSION: 1.0
import React, { useState, useEffect } from 'react';

export default function UpdateDialog() {
  const [show, setShow] = useState(false);
  const [version, setVersion] = useState('');

  useEffect(() => {
    const unsub = window.eveApi.onUpdateAvailable((data) => {
      setVersion(data.version);
      setShow(true);
    });
    return unsub;
  }, []);

  if (!show) return null;

  const handleDownload = async () => {
    setShow(false);
    await window.eveApi.downloadUpdate();
  };

  const handleDismiss = async () => {
    setShow(false);
    await window.eveApi.dismissUpdate();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg border border-gray-600 max-w-sm w-full shadow-xl">
        <h2 className="text-xl font-bold text-white mb-2">New Update Available</h2>
        <p className="text-gray-300 mb-6">Version {version} is ready to download.</p>
        <div className="flex justify-end gap-3">
          <button onClick={handleDismiss} className="px-4 py-2 bg-gray-700 text-gray-300 rounded hover:bg-gray-600">
            Remind Me Later
          </button>
          <button onClick={handleDownload} className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-500">
            Download Now
          </button>
        </div>
      </div>
    </div>
  );
}
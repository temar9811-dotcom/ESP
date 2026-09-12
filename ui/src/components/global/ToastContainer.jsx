// File: ui/src/components/global/ToastContainer.jsx | Version: 1.0
import React from 'react';

export default function ToastContainer({ toasts }) {
  if (!toasts || toasts.length === 0) return null;
  return (
    <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50 pointer-events-none">
      {toasts.map((toast) => (
        <div key={toast.id} className="bg-gray-800 border border-gray-600 text-gray-100 px-4 py-3 rounded-lg shadow-lg min-w-[250px] pointer-events-auto">
          <h4 className="text-sm font-bold text-blue-400">{toast.title}</h4>
          <p className="text-xs text-gray-300 mt-1">{toast.body}</p>
        </div>
      ))}
    </div>
  );
}
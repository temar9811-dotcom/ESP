// File: ui/src/components/GroupSelect.jsx | Version: 1.0
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export default function GroupSelect({ value, groups, onAssign }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(null);
  const btnRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const toggle = (e) => {
    e.stopPropagation();
    if (open) { setOpen(false); return; }
    const r = btnRef.current.getBoundingClientRect();
    const menuH = Math.min(groups.length * 34 + 70, 288);
    let top = r.bottom + 4;
    if (top + menuH > window.innerHeight) top = r.top - menuH - 4;
    setPos({
      left: Math.min(r.left, window.innerWidth - 208),
      top,
      width: Math.max(r.width, 176)
    });
    setOpen(true);
  };

  const choose = (e, name) => {
    e.stopPropagation();
    setOpen(false);
    onAssign(name);
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={toggle}
        title="Set account group for this character"
        className="mt-2 max-w-full w-fit truncate text-xs px-1.5 py-0.5 rounded border border-gray-600 bg-gray-800 text-gray-400 hover:text-blue-300 hover:border-blue-500"
      >
        Group: {value || 'None'} ▾
      </button>
      {open && pos && createPortal(
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />,
        document.body
      )}
      {open && pos && createPortal(
        <div
          className="fixed z-50 max-h-72 overflow-y-auto rounded-md border border-gray-600 bg-gray-800 py-1 shadow-xl"
          style={{ top: pos.top, left: pos.left, minWidth: pos.width }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-3 pb-1 pt-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-500">
            Assign group
          </div>
          {groups.length === 0 && (
            <div className="px-3 py-2 text-xs text-gray-500">
              No groups yet — create one from the top bar.
            </div>
          )}
          {groups.map((name) => (
            <button
              key={name}
              onClick={(e) => choose(e, name)}
              className={`block w-full text-left truncate px-3 py-1.5 text-xs transition-colors ${
                name === value
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'text-gray-200 hover:bg-gray-700'
              }`}
              title={name}
            >
              {name === value ? '✓ ' : ''}{name}
            </button>
          ))}
          <div className="my-1 border-t border-gray-700" />
          <button
            onClick={(e) => choose(e, '')}
            className={`block w-full text-left px-3 py-1.5 text-xs transition-colors ${
              !value ? 'bg-blue-600/30 text-blue-300' : 'text-gray-400 hover:bg-gray-700'
            }`}
          >
            {!value ? '✓ ' : ''}None (ungroup)
          </button>
        </div>,
        document.body
      )}
    </>
  );
}
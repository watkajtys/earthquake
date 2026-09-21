import React, { useRef } from 'react';
import { useDialogKeyboard } from '../hooks/useDialogKeyboard.js';

export default function RouteDetailStatus({ title, message, onClose, onRetry, loading = false }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useDialogKeyboard({ dialogRef, initialFocusRef: closeRef, onClose });
  return (
    <div className="fixed inset-0 bg-slate-900 bg-opacity-75 flex items-center justify-center z-[60] p-4">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}
        className="bg-slate-800 p-6 rounded-lg shadow-2xl text-slate-200 border border-slate-700">
        <h1 className="text-xl font-semibold mb-3">{title}</h1>
        <p role={loading ? 'status' : undefined} className="text-sm mb-4">{message}</p>
        {onRetry && <button onClick={onRetry} className="px-4 py-2 mr-3 bg-indigo-600 rounded-md">Retry</button>}
        <button ref={closeRef} onClick={onClose} className="px-4 py-2 bg-slate-600 rounded-md">Close</button>
      </div>
    </div>
  );
}

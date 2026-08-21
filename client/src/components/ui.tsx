import { useState } from 'react';

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    received: 'bg-gray-100 text-gray-700',
    diagnosing: 'bg-blue-100 text-blue-700',
    waiting_approval: 'bg-amber-100 text-amber-700',
    repairing: 'bg-purple-100 text-purple-700',
    ready_for_pickup: 'bg-cyan-100 text-cyan-700',
    completed: 'bg-green-100 text-green-700',
  };
  return <span className={`badge ${map[status] ?? 'bg-gray-100'}`}>{status.replace(/_/g, ' ')}</span>;
}

export function Loading() {
  return <div className="text-gray-400">Loading...</div>;
}

export function EmptyState({ message }: { message: string }) {
  return <p className="text-gray-400 text-sm py-4 text-center">{message}</p>;
}

export function ConfirmDialog({ open, message, onConfirm, onCancel }: {
  open: boolean; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <p className="text-gray-800 mb-4">{message}</p>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="btn-ghost">Cancel</button>
          <button onClick={onConfirm} className="btn-danger">Delete</button>
        </div>
      </div>
    </div>
  );
}

export function Modal({ open, onClose, title, children }: {
  open: boolean; onClose: () => void; title: string; children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl p-6 max-w-lg w-full mx-4 shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">&times;</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function useModal() {
  const [open, setOpen] = useState(false);
  return { open, openModal: () => setOpen(true), closeModal: () => setOpen(false) };
}

export function Pagination({ page, totalPages, onPageChange }: {
  page: number; totalPages: number; onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  const pages: (number | '...')[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) pages.push(i);
    else if (pages[pages.length - 1] !== '...') pages.push('...');
  }
  return (
    <div className="flex items-center justify-center gap-1 mt-4 text-sm">
      <button disabled={page <= 1} onClick={() => onPageChange(page - 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">&lsaquo;</button>
      {pages.map((p, i) => p === '...' ? <span key={`e${i}`} className="px-2 py-1 text-gray-400">...</span> : (
        <button key={p} onClick={() => onPageChange(p)} className={`px-2 py-1 rounded border ${p === page ? 'bg-brand-600 text-white border-brand-600' : 'border-gray-200 hover:bg-gray-50'}`}>{p}</button>
      ))}
      <button disabled={page >= totalPages} onClick={() => onPageChange(page + 1)} className="px-2 py-1 rounded border border-gray-200 disabled:opacity-40 hover:bg-gray-50">&rsaquo;</button>
    </div>
  );
}

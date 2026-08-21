import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Modal, Loading, EmptyState } from '../components/ui.tsx';
import type { InventoryItem } from '../lib/types.ts';

export default function Inventory() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showLowOnly, setShowLowOnly] = useState(false);
  const [editing, setEditing] = useState<InventoryItem | null>(null);
  const [showModal, setShowModal] = useState(false);

  const isAdmin = user?.role === 'admin';

  async function load() {
    setLoading(true);
    try {
      const q = showLowOnly ? '?lowStock=true' : '';
      const data = await api.get<{ inventory: InventoryItem[] }>(`/inventory${q}`);
      setItems(data.inventory);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [showLowOnly]);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Inventory</h1>
        <div className="flex gap-2">
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={showLowOnly} onChange={(e) => setShowLowOnly(e.target.checked)} /> Low stock only</label>
          {isAdmin && <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">+ Add Part</button>}
        </div>
      </div>
      <div className="card">
        {loading ? <Loading /> : items.length === 0 ? <EmptyState message="No parts found." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Part Name</th><th>SKU</th><th>Category</th><th>Qty</th><th>Min</th><th>Price</th><th>Status</th>{isAdmin && <th>Actions</th>}
            </tr></thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-b border-gray-100 table-row">
                  <td className="py-2 font-medium">{p.part_name}</td>
                  <td className="font-mono text-xs">{p.sku}</td>
                  <td>{p.category ?? '-'}</td>
                  <td className={p.quantity <= p.min_stock ? 'text-red-600 font-bold' : ''}>{p.quantity}</td>
                  <td>{p.min_stock}</td>
                  <td>RM{p.selling_price.toFixed(2)}</td>
                  <td>{p.quantity <= p.min_stock ? <span className="badge bg-red-100 text-red-700">Low</span> : <span className="badge bg-green-100 text-green-700">OK</span>}</td>
                  <td>{isAdmin && <button onClick={() => { setEditing(p); setShowModal(true); }} className="text-brand-600 text-xs">Edit</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <PartModal part={editing} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function PartModal({ part, onClose, onSaved }: { part: InventoryItem | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    part_name: part?.part_name ?? '', sku: part?.sku ?? '', category: part?.category ?? '',
    quantity: part?.quantity ?? 0, min_stock: part?.min_stock ?? 0,
    cost: part?.cost ?? 0, selling_price: part?.selling_price ?? 0, supplier: part?.supplier ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (part) {
        await api.put(`/inventory/${part.id}`, form);
        toast('Part updated', 'success');
      } else {
        await api.post('/inventory', form);
        toast('Part created', 'success');
      }
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={true} onClose={onClose} title={part ? 'Edit Part' : 'Add Part'}>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1">Part Name</label><input className="input" value={form.part_name} onChange={(e) => setForm({ ...form, part_name: e.target.value })} required /></div>
          <div><label className="block text-sm font-medium mb-1">SKU</label><input className="input" value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} required /></div>
          <div><label className="block text-sm font-medium mb-1">Category</label><input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Supplier</label><input className="input" value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Quantity</label><input type="number" className="input" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: +e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Min Stock</label><input type="number" className="input" value={form.min_stock} onChange={(e) => setForm({ ...form, min_stock: +e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Cost (RM)</label><input type="number" step="0.01" className="input" value={form.cost} onChange={(e) => setForm({ ...form, cost: +e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Selling Price (RM)</label><input type="number" step="0.01" className="input" value={form.selling_price} onChange={(e) => setForm({ ...form, selling_price: +e.target.value })} /></div>
        </div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

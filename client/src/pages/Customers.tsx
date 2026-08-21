import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useAuth } from '../lib/auth.tsx';
import { useToast } from '../lib/toast.tsx';
import { useModal, Modal, ConfirmDialog, Loading, EmptyState, Pagination } from '../components/ui.tsx';
import type { Customer } from '../lib/types.ts';

export default function Customers() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<{ page: number; totalPages: number; total: number }>({ page: 1, totalPages: 1, total: 0 });
  const [editing, setEditing] = useState<Customer | null>(null);
  const modal = useModal();
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const isAdmin = user?.role === 'admin';

  async function load() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('q', search);
      params.set('page', String(page));
      params.set('limit', '20');
      const data = await api.get<{ customers: Customer[]; pagination: { page: number; totalPages: number; total: number } }>(`/customers?${params}`);
      setCustomers(data.customers);
      setPagination(data.pagination);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [search, page]);

  async function handleDelete() {
    if (!deleteId) return;
    try {
      await api.del(`/customers/${deleteId}`);
      toast('Customer deleted', 'success');
      setDeleteId(null);
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        {isAdmin && <button onClick={() => { setEditing(null); modal.openModal(); }} className="btn-primary">+ Add Customer</button>}
      </div>

      <input className="input mb-4" placeholder="Search by name, phone, email..." value={search} onChange={(e) => setSearch(e.target.value)} />

      <div className="card">
        {loading ? <Loading /> : customers.length === 0 ? <EmptyState message="No customers found." /> : (
          <>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Name</th><th>Phone</th><th>Email</th><th>Address</th>{isAdmin && <th>Actions</th>}
            </tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-gray-100 table-row">
                  <td className="py-2 font-medium">{c.name}</td>
                  <td>{c.phone ?? '-'}</td>
                  <td>{c.email ?? '-'}</td>
                  <td className="max-w-xs truncate">{c.address ?? '-'}</td>
                  <td>{isAdmin && (
                    <div className="flex gap-1">
                      <button onClick={() => { setEditing(c); modal.openModal(); }} className="text-brand-600 hover:text-brand-800 text-xs">Edit</button>
                      <button onClick={() => setDeleteId(c.id)} className="text-red-600 hover:text-red-800 text-xs">Delete</button>
                    </div>
                  )}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={setPage} />
          </>
        )}
      </div>

      {isAdmin && modal.open && (
        <CustomerModal customer={editing} onClose={modal.closeModal} onSaved={() => { modal.closeModal(); load(); }} />
      )}
      <ConfirmDialog open={!!deleteId} message="Delete this customer?" onConfirm={handleDelete} onCancel={() => setDeleteId(null)} />
    </div>
  );
}

function CustomerModal({ customer, onClose, onSaved }: { customer: Customer | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [name, setName] = useState(customer?.name ?? '');
  const [phone, setPhone] = useState(customer?.phone ?? '');
  const [email, setEmail] = useState(customer?.email ?? '');
  const [address, setAddress] = useState(customer?.address ?? '');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const body = { name, phone, email: email || undefined, address };
      if (customer) {
        await api.put(`/customers/${customer.id}`, body);
        toast('Customer updated', 'success');
      } else {
        await api.post('/customers', body);
        toast('Customer created', 'success');
      }
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={true} onClose={onClose} title={customer ? 'Edit Customer' : 'Add Customer'}>
      <form onSubmit={save} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} required /></div>
        <div><label className="block text-sm font-medium mb-1">Phone</label><input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Email</label><input type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div><label className="block text-sm font-medium mb-1">Address</label><textarea className="input" value={address} onChange={(e) => setAddress(e.target.value)} /></div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

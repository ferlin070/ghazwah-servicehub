import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { Modal, Loading, EmptyState } from '../components/ui.tsx';
import type { Device, Customer } from '../lib/types.ts';

export default function Devices() {
  const { toast } = useToast();
  const [devices, setDevices] = useState<Device[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Device | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ devices: Device[] }>('/devices');
      setDevices(data.devices);
      const c = await api.get<{ customers: Customer[] }>('/customers');
      setCustomers(c.customers);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Devices</h1>
        <button onClick={() => { setEditing(null); setShowModal(true); }} className="btn-primary">+ Add Device</button>
      </div>
      <div className="card">
        {loading ? <Loading /> : devices.length === 0 ? <EmptyState message="No devices." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Brand</th><th>Model</th><th>Serial</th><th>Type</th><th>Condition</th><th>Actions</th>
            </tr></thead>
            <tbody>
              {devices.map((d) => (
                <tr key={d.id} className="border-b border-gray-100 table-row">
                  <td className="py-2 font-medium">{d.brand}</td>
                  <td>{d.model}</td>
                  <td>{d.serial_number ?? '-'}</td>
                  <td>{d.device_type}</td>
                  <td>{d.condition ?? '-'}</td>
                  <td><button onClick={() => { setEditing(d); setShowModal(true); }} className="text-brand-600 text-xs">Edit</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showModal && <DeviceModal device={editing} customers={customers} onClose={() => setShowModal(false)} onSaved={() => { setShowModal(false); load(); }} />}
    </div>
  );
}

function DeviceModal({ device, customers, onClose, onSaved }: { device: Device | null; customers: Customer[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [form, setForm] = useState({
    customer_id: device?.customer_id ?? customers[0]?.id ?? '',
    brand: device?.brand ?? '', model: device?.model ?? '',
    serial_number: device?.serial_number ?? '', device_type: device?.device_type ?? 'laptop',
    condition: device?.condition ?? '', accessories: device?.accessories ?? '', notes: device?.notes ?? '',
  });
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (device) {
        await api.put(`/devices/${device.id}`, form);
        toast('Device updated', 'success');
      } else {
        await api.post('/devices', form);
        toast('Device created', 'success');
      }
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={true} onClose={onClose} title={device ? 'Edit Device' : 'Add Device'}>
      <form onSubmit={save} className="space-y-4">
        {!device && (
          <div><label className="block text-sm font-medium mb-1">Customer</label>
            <select className="input" value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} required>
              {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div><label className="block text-sm font-medium mb-1">Brand</label><input className="input" value={form.brand} onChange={(e) => setForm({ ...form, brand: e.target.value })} required /></div>
          <div><label className="block text-sm font-medium mb-1">Model</label><input className="input" value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} required /></div>
          <div><label className="block text-sm font-medium mb-1">Serial Number</label><input className="input" value={form.serial_number} onChange={(e) => setForm({ ...form, serial_number: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Type</label>
            <select className="input" value={form.device_type} onChange={(e) => setForm({ ...form, device_type: e.target.value })}>
              <option value="laptop">Laptop</option><option value="desktop">Desktop</option><option value="phone">Phone</option><option value="tablet">Tablet</option><option value="other">Other</option>
            </select>
          </div>
          <div><label className="block text-sm font-medium mb-1">Condition</label><input className="input" value={form.condition} onChange={(e) => setForm({ ...form, condition: e.target.value })} /></div>
          <div><label className="block text-sm font-medium mb-1">Accessories</label><input className="input" value={form.accessories} onChange={(e) => setForm({ ...form, accessories: e.target.value })} /></div>
        </div>
        <div><label className="block text-sm font-medium mb-1">Notes</label><textarea className="input" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Save'}</button></div>
      </form>
    </Modal>
  );
}

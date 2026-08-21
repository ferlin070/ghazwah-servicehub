import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Modal, Loading, EmptyState, StatusBadge } from '../components/ui.tsx';
import type { WorkOrder, TimelineEvent, Customer, Device } from '../lib/types.ts';

const STATUS_OPTIONS = ['received', 'diagnosing', 'waiting_approval', 'repairing', 'ready_for_pickup', 'completed'] as const;

export default function WorkOrders() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<WorkOrder | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const detailId = params.get('id');

  const canEdit = user?.role === 'admin' || user?.role === 'staff';

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ work_orders: WorkOrder[] }>('/work-orders');
      setOrders(data.work_orders);
      if (detailId) {
        const wo = data.work_orders.find((w) => w.id === detailId);
        if (wo) await selectOrder(wo);
      }
      if (canEdit) {
        const c = await api.get<{ customers: Customer[] }>('/customers');
        setCustomers(c.customers);
        const d = await api.get<{ devices: Device[] }>('/devices');
        setDevices(d.devices);
      }
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  async function selectOrder(wo: WorkOrder) {
    setSelected(wo);
    try {
      const tl = await api.get<{ timeline: TimelineEvent[] }>(`/work-orders/${wo.id}/timeline`);
      setTimeline(tl.timeline);
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  async function updateStatus(wo: WorkOrder, status: string) {
    try {
      await api.put(`/work-orders/${wo.id}`, { status });
      toast('Status updated', 'success');
      load();
    } catch (e) { toast((e as Error).message, 'error'); }
  }

  useEffect(() => { load(); }, [detailId]);

  if (selected) {
    return (
      <div>
        <button onClick={() => setSelected(null)} className="btn-ghost mb-4">&larr; Back</button>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2">
            <div className="card">
              <div className="flex items-center justify-between mb-4">
                <h1 className="text-xl font-bold">{selected.order_number}</h1>
                <StatusBadge status={selected.status} />
              </div>
              <dl className="grid grid-cols-2 gap-4 text-sm">
                <div><dt className="text-gray-500">Customer</dt><dd className="font-medium">{selected.customer_name ?? '-'}</dd></div>
                <div><dt className="text-gray-500">Device</dt><dd className="font-medium">{selected.brand} {selected.model}</dd></div>
                <div><dt className="text-gray-500">Problem</dt><dd>{selected.problem}</dd></div>
                <div><dt className="text-gray-500">Diagnosis</dt><dd>{selected.diagnosis ?? '-'}</dd></div>
                <div><dt className="text-gray-500">Priority</dt><dd className="capitalize">{selected.priority}</dd></div>
                <div><dt className="text-gray-500">Est. Cost</dt><dd>{selected.estimated_cost != null ? `RM${selected.estimated_cost}` : '-'}</dd></div>
              </dl>
              {canEdit && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <label className="block text-sm font-medium mb-1">Update Status</label>
                  <select className="input" value={selected.status} onChange={(e) => updateStatus(selected, e.target.value)}>
                    {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>
          <div>
            <h2 className="text-lg font-semibold mb-3">Repair Timeline</h2>
            <div className="card">
              {timeline.length === 0 ? <EmptyState message="No events yet." /> : (
                <ol className="space-y-3">
                  {timeline.map((e) => (
                    <li key={e.id} className="flex gap-3">
                      <div className="w-2 h-2 rounded-full bg-brand-500 mt-2 flex-shrink-0" />
                      <div>
                        <div className="text-sm font-medium capitalize">{e.event.replace(/_/g, ' ')}</div>
                        {e.description && <div className="text-xs text-gray-500">{e.description}</div>}
                        <div className="text-xs text-gray-400">{e.actor_name ?? 'System'} &middot; {new Date(e.created_at).toLocaleString()}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Work Orders</h1>
        {canEdit && <button onClick={() => setShowCreate(true)} className="btn-primary">+ Create Work Order</button>}
      </div>
      <div className="card">
        {loading ? <Loading /> : orders.length === 0 ? <EmptyState message="No work orders." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Order #</th><th>Customer</th><th>Problem</th><th>Priority</th><th>Status</th>
            </tr></thead>
            <tbody>
              {orders.map((w) => (
                <tr key={w.id} className="border-b border-gray-100 table-row cursor-pointer" onClick={() => selectOrder(w)}>
                  <td className="py-2 font-medium">{w.order_number}</td>
                  <td>{w.customer_name ?? '-'}</td>
                  <td className="max-w-xs truncate">{w.problem}</td>
                  <td><span className={`badge ${w.priority === 'urgent' ? 'bg-red-100 text-red-700' : w.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{w.priority}</span></td>
                  <td><StatusBadge status={w.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {showCreate && <CreateWOModal customers={customers} devices={devices} onClose={() => setShowCreate(false)} onSaved={() => { setShowCreate(false); load(); }} />}
    </div>
  );
}

function CreateWOModal({ customers, devices, onClose, onSaved }: { customers: Customer[]; devices: Device[]; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [deviceId, setDeviceId] = useState('');
  const [problem, setProblem] = useState('');
  const [priority, setPriority] = useState('normal');
  const [saving, setSaving] = useState(false);

  const customerDevices = devices.filter((d) => d.customer_id === customerId);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/work-orders', { customer_id: customerId, device_id: deviceId, problem, priority });
      toast('Work order created', 'success');
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={true} onClose={onClose} title="Create Work Order">
      <form onSubmit={save} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Customer</label>
          <select className="input" value={customerId} onChange={(e) => { setCustomerId(e.target.value); setDeviceId(''); }} required>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <div><label className="block text-sm font-medium mb-1">Device</label>
          <select className="input" value={deviceId} onChange={(e) => setDeviceId(e.target.value)} required>
            <option value="">Select device...</option>
            {customerDevices.map((d) => <option key={d.id} value={d.id}>{d.brand} {d.model} ({d.serial_number ?? 'no serial'})</option>)}
          </select>
          {customerDevices.length === 0 && <p className="text-xs text-gray-400 mt-1">No devices for this customer.</p>}
        </div>
        <div><label className="block text-sm font-medium mb-1">Problem</label><textarea className="input" value={problem} onChange={(e) => setProblem(e.target.value)} required /></div>
        <div><label className="block text-sm font-medium mb-1">Priority</label>
          <select className="input" value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option><option value="urgent">Urgent</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Creating...' : 'Create'}</button></div>
      </form>
    </Modal>
  );
}

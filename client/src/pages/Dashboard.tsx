import { useEffect, useState } from 'react';
import { api } from '../lib/api.ts';

interface AdminDashboard {
  role: 'admin';
  stats: { total_customers: number; total_work_orders: number; pending: number; repairing: number; completed: number; revenue: number };
  recent_activity: { event: string; description: string; created_at: string; actor_name: string; order_number: string }[];
}
interface StaffDashboard {
  role: 'staff';
  stats: { my_work_orders: number; active: number; today_tasks: number };
  work_orders: { id: string; order_number: string; status: string; priority: string; problem: string; customer_name: string }[];
  today_tasks: { id: string; order_number: string; status: string; problem: string }[];
}
interface CustomerDashboard {
  role: 'customer';
  stats: { devices: number; active_repairs: number; invoices: number };
  devices: { id: string; brand: string; model: string; serial_number: string; device_type: string }[];
  work_orders: { id: string; order_number: string; status: string; problem: string; created_at: string; completed_date: string }[];
  invoices: { id: string; invoice_number: string; total: number; payment_status: string }[];
}

export default function Dashboard() {
  const [data, setData] = useState<AdminDashboard | StaffDashboard | CustomerDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<AdminDashboard | StaffDashboard | CustomerDashboard>('/dashboard')
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-gray-400">Loading dashboard...</div>;
  if (error) return <div className="text-red-600">{error}</div>;
  if (!data) return null;

  if (data.role === 'admin') {
    const d = data as AdminDashboard;
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Admin Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
          <StatCard label="Customers" value={d.stats.total_customers} />
          <StatCard label="Work Orders" value={d.stats.total_work_orders} />
          <StatCard label="Pending" value={d.stats.pending} color="amber" />
          <StatCard label="Repairing" value={d.stats.repairing} color="blue" />
          <StatCard label="Completed" value={d.stats.completed} color="green" />
          <StatCard label="Revenue" value={`RM${d.stats.revenue.toFixed(2)}`} color="green" />
        </div>
        <h2 className="text-lg font-semibold mb-3">Recent Activity</h2>
        <div className="card">
          {d.recent_activity.length === 0 ? (
            <p className="text-gray-400 text-sm">No recent activity.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {d.recent_activity.map((a, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 text-gray-600"><span className="badge bg-brand-100 text-brand-700 mr-2">{a.event}</span>{a.description}</td>
                    <td className="py-2 text-gray-500">{a.order_number}</td>
                    <td className="py-2 text-gray-400 text-right">{a.actor_name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  if (data.role === 'staff') {
    const d = data as StaffDashboard;
    return (
      <div>
        <h1 className="text-2xl font-bold mb-6">Staff Dashboard</h1>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <StatCard label="My Work Orders" value={d.stats.my_work_orders} />
          <StatCard label="Active" value={d.stats.active} color="blue" />
          <StatCard label="Today's Tasks" value={d.stats.today_tasks} color="amber" />
        </div>
        <h2 className="text-lg font-semibold mb-3">My Work Orders</h2>
        <div className="card">
          {d.work_orders.length === 0 ? (
            <p className="text-gray-400 text-sm">No work orders assigned.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-gray-200 text-left text-gray-500">
                <th className="py-2">Order #</th><th>Customer</th><th>Problem</th><th>Priority</th><th>Status</th>
              </tr></thead>
              <tbody>
                {d.work_orders.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 table-row">
                    <td className="py-2 font-medium">{w.order_number}</td>
                    <td>{w.customer_name}</td>
                    <td className="max-w-xs truncate">{w.problem}</td>
                    <td><span className={`badge ${w.priority === 'urgent' ? 'bg-red-100 text-red-700' : w.priority === 'high' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}>{w.priority}</span></td>
                    <td><StatusBadge status={w.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    );
  }

  // customer
  const d = data as CustomerDashboard;
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">My Dashboard</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="My Devices" value={d.stats.devices} />
        <StatCard label="Active Repairs" value={d.stats.active_repairs} color="amber" />
        <StatCard label="Invoices" value={d.stats.invoices} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <h2 className="text-lg font-semibold mb-3">My Devices</h2>
          <div className="card">
            {d.devices.length === 0 ? <p className="text-gray-400 text-sm">No devices registered.</p> : (
              <table className="w-full text-sm">
                <tbody>{d.devices.map((dev) => (
                  <tr key={dev.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-medium">{dev.brand} {dev.model}</td>
                    <td className="text-gray-500">{dev.serial_number}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
        <div>
          <h2 className="text-lg font-semibold mb-3">My Repairs</h2>
          <div className="card">
            {d.work_orders.length === 0 ? <p className="text-gray-400 text-sm">No repairs yet.</p> : (
              <table className="w-full text-sm">
                <tbody>{d.work_orders.map((w) => (
                  <tr key={w.id} className="border-b border-gray-100 last:border-0">
                    <td className="py-2 font-medium">{w.order_number}</td>
                    <td className="text-gray-500 truncate max-w-xs">{w.problem}</td>
                    <td><StatusBadge status={w.status} /></td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colorMap: Record<string, string> = {
    gray: 'bg-gray-50 text-gray-700',
    green: 'bg-green-50 text-green-700',
    blue: 'bg-blue-50 text-blue-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return (
    <div className={`rounded-xl border border-gray-200 p-4 ${colorMap[color] ?? colorMap.gray}`}>
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-sm opacity-75">{label}</div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
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

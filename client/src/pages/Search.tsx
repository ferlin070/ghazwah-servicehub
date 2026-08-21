import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { EmptyState } from '../components/ui.tsx';

interface SearchResults {
  results: {
    customers: { id: string; name: string; phone?: string; email?: string }[];
    work_orders: { id: string; order_number: string; status: string; problem: string; customer_name?: string }[];
    invoices: { id: string; invoice_number: string; total: number; payment_status: string; customer_name?: string }[];
    devices: { id: string; brand: string; model: string; serial_number: string; device_type: string; customer_name?: string }[];
  };
}

export default function Search() {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [results, setResults] = useState<SearchResults['results'] | null>(null);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    setLoading(true); setSearched(true);
    try {
      const data = await api.get<SearchResults>(`/search?q=${encodeURIComponent(q)}`);
      setResults(data.results);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Global Search</h1>
      <form onSubmit={search} className="flex gap-2 mb-6">
        <input className="input flex-1" placeholder="Search customers, work orders, invoices, devices, serial numbers..." value={q} onChange={(e) => setQ(e.target.value)} />
        <button type="submit" className="btn-primary" disabled={loading || !q.trim()}>{loading ? 'Searching...' : 'Search'}</button>
      </form>

      {searched && results && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResultCard title="Customers" items={results.customers.map((c) => ({ primary: c.name, secondary: `${c.phone ?? '-'} | ${c.email ?? '-'}` }))} />
          <ResultCard title="Work Orders" items={results.work_orders.map((w) => ({ primary: w.order_number, secondary: `${w.problem} (${w.customer_name ?? '-'})` }))} />
          <ResultCard title="Invoices" items={results.invoices.map((i) => ({ primary: i.invoice_number, secondary: `RM${i.total.toFixed(2)} - ${i.payment_status}` }))} />
          <ResultCard title="Devices" items={results.devices.map((d) => ({ primary: `${d.brand} ${d.model}`, secondary: `${d.serial_number ?? '-'} (${d.customer_name ?? '-'})` }))} />
        </div>
      )}
      {searched && results && results.customers.length + results.work_orders.length + results.invoices.length + results.devices.length === 0 && (
        <EmptyState message="No results found." />
      )}
    </div>
  );
}

function ResultCard({ title, items }: { title: string; items: { primary: string; secondary: string }[] }) {
  return (
    <div className="card">
      <h2 className="text-sm font-semibold text-gray-500 mb-3">{title} ({items.length})</h2>
      {items.length === 0 ? <p className="text-gray-300 text-sm">No matches.</p> : (
        <ul className="space-y-2">
          {items.map((item, i) => (
            <li key={i} className="border-b border-gray-100 last:border-0 pb-2">
              <div className="font-medium text-sm">{item.primary}</div>
              <div className="text-xs text-gray-500">{item.secondary}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

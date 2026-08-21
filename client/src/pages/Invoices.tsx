import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useToast } from '../lib/toast.tsx';
import { useAuth } from '../lib/auth.tsx';
import { Modal, Loading, EmptyState } from '../components/ui.tsx';
import type { Invoice, InvoiceItem, Payment } from '../lib/types.ts';

export default function Invoices() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [params] = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(params.get('id'));

  const canEdit = user?.role === 'admin' || user?.role === 'staff';

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ invoices: Invoice[] }>('/invoices');
      setInvoices(data.invoices);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  if (selected) {
    return <InvoiceDetail id={selected} onBack={() => setSelected(null)} canEdit={canEdit} />;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">Invoices</h1>
      <div className="card">
        {loading ? <Loading /> : invoices.length === 0 ? <EmptyState message="No invoices." /> : (
          <table className="w-full text-sm">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Invoice #</th><th>Customer</th><th>Work Order</th><th>Total</th><th>Payment</th>
            </tr></thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100 table-row cursor-pointer" onClick={() => setSelected(inv.id)}>
                  <td className="py-2 font-medium">{inv.invoice_number}</td>
                  <td>{inv.customer_name ?? '-'}</td>
                  <td>{inv.order_number ?? '-'}</td>
                  <td>RM{inv.total.toFixed(2)}</td>
                  <td><span className={`badge ${inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : inv.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{inv.payment_status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function InvoiceDetail({ id, onBack, canEdit }: { id: string; onBack: () => void; canEdit: boolean }) {
  const { toast } = useToast();
  const [inv, setInv] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPay, setShowPay] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await api.get<{ invoice: Invoice; items: InvoiceItem[]; payments: Payment[] }>(`/invoices/${id}`);
      setInv(data.invoice); setItems(data.items); setPayments(data.payments);
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [id]);

  if (loading || !inv) return <Loading />;

  return (
    <div>
      <button onClick={onBack} className="btn-ghost mb-4">&larr; Back to Invoices</button>
      <div className="max-w-2xl">
        <div className="card">
          <div className="flex justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">{inv.invoice_number}</h1>
              <p className="text-gray-500">{inv.customer_name ?? '-'}</p>
            </div>
            <div className="text-right">
              <span className={`badge ${inv.payment_status === 'paid' ? 'bg-green-100 text-green-700' : inv.payment_status === 'partial' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>{inv.payment_status}</span>
            </div>
          </div>

          {inv.repair_description && <p className="text-sm text-gray-600 mb-4">{inv.repair_description}</p>}

          <table className="w-full text-sm mb-4">
            <thead><tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Description</th><th>Qty</th><th>Price</th><th>Total</th>
            </tr></thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id} className="border-b border-gray-100">
                  <td className="py-2">{it.description}</td>
                  <td>{it.quantity}</td>
                  <td>RM{it.unit_price.toFixed(2)}</td>
                  <td>RM{it.line_total.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="space-y-1 text-sm ml-auto max-w-xs">
            <div className="flex justify-between"><span className="text-gray-500">Labour</span><span>RM{inv.labour.toFixed(2)}</span></div>
            {inv.discount > 0 && <div className="flex justify-between text-green-600"><span>Discount</span><span>-RM{inv.discount.toFixed(2)}</span></div>}
            <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>RM{inv.tax.toFixed(2)}</span></div>
            <div className="flex justify-between font-bold text-lg pt-2 border-t border-gray-200"><span>Total</span><span>RM{inv.total.toFixed(2)}</span></div>
          </div>

          {payments.length > 0 && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <h3 className="text-sm font-semibold mb-2">Payments</h3>
              {payments.map((p) => (
                <div key={p.id} className="flex justify-between text-sm text-gray-600">
                  <span>{p.method ?? '-'} &middot; {new Date(p.paid_at).toLocaleDateString()}</span>
                  <span>RM{p.amount.toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}

          {canEdit && inv.payment_status !== 'paid' && (
            <button onClick={() => setShowPay(true)} className="btn-primary mt-4">Record Payment</button>
          )}
        </div>
      </div>
      {showPay && <PaymentModal invoiceId={id} total={inv.total} onClose={() => setShowPay(false)} onSaved={() => { setShowPay(false); load(); }} />}
    </div>
  );
}

function PaymentModal({ invoiceId, total, onClose, onSaved }: { invoiceId: string; total: number; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();
  const [amount, setAmount] = useState(total);
  const [method, setMethod] = useState('cash');
  const [saving, setSaving] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/invoices/${invoiceId}/payments`, { amount, method });
      toast('Payment recorded', 'success');
      onSaved();
    } catch (e) { toast((e as Error).message, 'error'); }
    finally { setSaving(false); }
  }

  return (
    <Modal open={true} onClose={onClose} title="Record Payment">
      <form onSubmit={save} className="space-y-4">
        <div><label className="block text-sm font-medium mb-1">Amount (RM)</label><input type="number" step="0.01" className="input" value={amount} onChange={(e) => setAmount(+e.target.value)} required /></div>
        <div><label className="block text-sm font-medium mb-1">Method</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="cash">Cash</option><option value="card">Card</option><option value="transfer">Transfer</option>
          </select>
        </div>
        <div className="flex gap-2 justify-end"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button type="submit" className="btn-primary" disabled={saving}>{saving ? 'Saving...' : 'Record'}</button></div>
      </form>
    </Modal>
  );
}

// routes/search.ts — global search across customers, work orders, invoices, devices.
// admin: all. staff: work orders assigned + devices/inventory. customer: own data only.
import { Hono } from 'hono';
import { query } from '../lib/query.ts';
import { authenticate } from '../middleware/auth.ts';

const search = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

search.use('*', authenticate);

// GET /api/search?q=keyword
search.get('/', async (c) => {
  const user = c.get('user')!;
  const q = (c.req.query('q') ?? '').trim();
  if (!q) return c.json({ results: { customers: [], work_orders: [], invoices: [], devices: [] } });

  const like = `%${q}%`;
  const results: Record<string, unknown[]> = {
    customers: [],
    work_orders: [],
    invoices: [],
    devices: [],
  };

  if (user.role === 'customer') {
    // Customer sees only their own data
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow) return c.json({ results });
    const cid = custRow.id as string;

    results.work_orders = await query.all(
      `SELECT w.id, w.order_number, w.status, w.problem
       FROM work_orders w WHERE w.customer_id = ? AND (w.order_number LIKE ? OR w.problem LIKE ?)`,
      cid, like, like,
    );
    results.invoices = await query.all(
      `SELECT i.id, i.invoice_number, i.total, i.payment_status
       FROM invoices i WHERE i.customer_id = ? AND (i.invoice_number LIKE ?)`,
      cid, like,
    );
    results.devices = await query.all(
      `SELECT d.id, d.brand, d.model, d.serial_number, d.device_type
       FROM devices d WHERE d.customer_id = ? AND (d.brand LIKE ? OR d.model LIKE ? OR d.serial_number LIKE ?)`,
      cid, like, like, like,
    );
  } else {
    // admin/staff see all
    results.customers = await query.all(
      `SELECT c.id, c.name, c.phone, c.email FROM customers c
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?`,
      like, like, like,
    );
    results.work_orders = await query.all(
      `SELECT w.id, w.order_number, w.status, w.problem, c.name AS customer_name
       FROM work_orders w JOIN customers c ON w.customer_id = c.id
       WHERE w.order_number LIKE ? OR w.problem LIKE ? OR c.name LIKE ?`,
      like, like, like,
    );
    results.invoices = await query.all(
      `SELECT i.id, i.invoice_number, i.total, i.payment_status, c.name AS customer_name
       FROM invoices i JOIN customers c ON i.customer_id = c.id
       WHERE i.invoice_number LIKE ? OR c.name LIKE ?`,
      like, like,
    );
    results.devices = await query.all(
      `SELECT d.id, d.brand, d.model, d.serial_number, d.device_type, c.name AS customer_name
       FROM devices d JOIN customers c ON d.customer_id = c.id
       WHERE d.brand LIKE ? OR d.model LIKE ? OR d.serial_number LIKE ?`,
      like, like, like,
    );
  }

  return c.json({ results });
});

export default search;

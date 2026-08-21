// routes/invoices.ts — invoice generation + list + payment status.
// admin/staff: generate, list all, update. customer: read own invoices only.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { parsePagination, makeMeta } from '../lib/pagination.ts';

const invoices = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const invoiceSchema = z.object({
  customer_id: z.string().min(1),
  work_order_id: z.string().min(1),
  repair_description: z.string().optional(),
  labour: z.number().nonnegative().default(0),
  discount: z.number().nonnegative().default(0),
  tax: z.number().nonnegative().default(0),
  items: z.array(z.object({
    inventory_id: z.string().optional(),
    description: z.string().min(1),
    quantity: z.number().int().positive().default(1),
    unit_price: z.number().nonnegative().default(0),
  })).default([]),
});

const invoiceUpdateSchema = z.object({
  repair_description: z.string().optional(),
  labour: z.number().nonnegative().optional(),
  discount: z.number().nonnegative().optional(),
  tax: z.number().nonnegative().optional(),
  payment_status: z.enum(['unpaid', 'partial', 'paid']).optional(),
});

invoices.use('*', authenticate);

// GET /api/invoices?customerId=...&status=...
invoices.get('/', async (c) => {
  const user = c.get('user')!;
  const customerId = c.req.query('customerId');
  const status = c.req.query('status');
  const { page, limit, offset } = parsePagination(c.req);

  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow) return c.json({ invoices: [], pagination: makeMeta(page, limit, 0) });
    const cid = custRow.id as string;
    const countRow = await query.get('SELECT COUNT(*) AS cnt FROM invoices WHERE customer_id = ?', cid);
    const total = countRow?.cnt as number;
    const rows = await query.all(
      `SELECT i.*, c.name AS customer_name, w.order_number
       FROM invoices i JOIN customers c ON i.customer_id = c.id JOIN work_orders w ON i.work_order_id = w.id
       WHERE i.customer_id = ? ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
      cid, limit, offset,
    );
    return c.json({ invoices: rows, pagination: makeMeta(page, limit, total) });
  }

  // admin/staff
  const base = `FROM invoices i JOIN customers c ON i.customer_id = c.id JOIN work_orders w ON i.work_order_id = w.id`;
  const select = `SELECT i.*, c.name AS customer_name, w.order_number`;
  let where = '1=1';
  const params: unknown[] = [];
  if (customerId) { where += ' AND i.customer_id = ?'; params.push(customerId); }
  if (status) { where += ' AND i.payment_status = ?'; params.push(status); }

  const countRow = await query.get(`SELECT COUNT(*) AS cnt ${base} WHERE ${where}`, ...params);
  const total = countRow?.cnt as number;
  const rows = await query.all(
    `${select} ${base} WHERE ${where} ORDER BY i.created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return c.json({ invoices: rows, pagination: makeMeta(page, limit, total) });
});

// GET /api/invoices/:id
invoices.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');

  const row = await query.get(
    `SELECT i.*, c.name AS customer_name, c.phone AS customer_phone, c.email AS customer_email, c.address AS customer_address,
            w.order_number, w.problem, d.brand, d.model, d.serial_number, d.device_type
     FROM invoices i
     JOIN customers c ON i.customer_id = c.id
     JOIN work_orders w ON i.work_order_id = w.id
     JOIN devices d ON w.device_id = d.id
     WHERE i.id = ?`,
    id,
  );
  if (!row) return c.json({ error: 'Invoice not found' }, 404);

  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow || row.customer_id !== custRow.id) {
      return c.json({ error: 'Forbidden: not your invoice' }, 403);
    }
  }

  // Fetch invoice items
  const items = await query.all(
    `SELECT ii.*, inv.part_name, inv.sku
     FROM invoice_items ii LEFT JOIN inventory inv ON ii.inventory_id = inv.id
     WHERE ii.invoice_id = ?`,
    id,
  );

  // Fetch payments
  const payments = await query.all(
    'SELECT * FROM payments WHERE invoice_id = ? ORDER BY paid_at DESC',
    id,
  );

  return c.json({ invoice: row, items, payments });
});

// POST /api/invoices — admin/staff
invoices.post('/', requireRole('admin', 'staff'), zValidator('json', invoiceSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof invoiceSchema>;

  // Verify customer + work order exist
  const cust = await query.get('SELECT id FROM customers WHERE id = ?', body.customer_id);
  if (!cust) return c.json({ error: 'Customer not found' }, 404);
  const wo = await query.get('SELECT id FROM work_orders WHERE id = ?', body.work_order_id);
  if (!wo) return c.json({ error: 'Work order not found' }, 404);

  const id = randomId();
  const year = new Date().getFullYear();
  const countRow = await query.get(
    `SELECT COUNT(*) AS cnt FROM invoices WHERE invoice_number LIKE ?`,
    `INV-${year}-%`,
  );
  const nextNum = ((countRow?.cnt as number) ?? 0) + 1;
  const invoiceNumber = `INV-${year}-${String(nextNum).padStart(4, '0')}`;

  // Calculate total: sum(items line_total) + labour - discount + tax
  const itemsTotal = body.items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);
  const total = itemsTotal + body.labour - body.discount + body.tax;

  await query.transaction(async () => {
    await query.run(
      `INSERT INTO invoices (id, invoice_number, customer_id, work_order_id, repair_description, labour, discount, tax, total, payment_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'unpaid')`,
      id, invoiceNumber, body.customer_id, body.work_order_id,
      body.repair_description ?? null, body.labour, body.discount, body.tax, total,
    );

    for (const it of body.items) {
      const itemId = randomId();
      const lineTotal = it.quantity * it.unit_price;
      await query.run(
        `INSERT INTO invoice_items (id, invoice_id, inventory_id, description, quantity, unit_price, line_total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        itemId, id, it.inventory_id ?? null, it.description, it.quantity, it.unit_price, lineTotal,
      );
    }
  });

  const row = await query.get('SELECT * FROM invoices WHERE id = ?', id);
  return c.json({ invoice: row }, 201);
});

// PUT /api/invoices/:id — admin/staff
invoices.put('/:id', requireRole('admin', 'staff'), zValidator('json', invoiceUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json' as never) as z.infer<typeof invoiceUpdateSchema>;

  const existing = await query.get('SELECT * FROM invoices WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Invoice not found' }, 404);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);

  // Recalculate total if labour/discount/tax changed
  if (body.labour !== undefined || body.discount !== undefined || body.tax !== undefined) {
    const itemsRows = await query.all(
      'SELECT line_total FROM invoice_items WHERE invoice_id = ?', id,
    );
    const itemsTotal = itemsRows.reduce((s, r) => s + (r.line_total as number), 0);
    const labour = body.labour ?? (existing.labour as number);
    const discount = body.discount ?? (existing.discount as number);
    const tax = body.tax ?? (existing.tax as number);
    const total = itemsTotal + labour - discount + tax;
    fields.push('total = ?');
    values.push(total);
  }

  fields.push(`updated_at = datetime('now')`);
  values.push(id);

  await query.run(`UPDATE invoices SET ${fields.join(', ')} WHERE id = ?`, ...values);
  const row = await query.get('SELECT * FROM invoices WHERE id = ?', id);
  return c.json({ invoice: row });
});

// POST /api/invoices/:id/payments — record a payment
invoices.post('/:id/payments', requireRole('admin', 'staff'), async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { amount?: number; method?: string };

  if (typeof body.amount !== 'number' || body.amount <= 0) {
    return c.json({ error: 'Valid amount required' }, 400);
  }

  const inv = await query.get('SELECT id, total, payment_status FROM invoices WHERE id = ?', id);
  if (!inv) return c.json({ error: 'Invoice not found' }, 404);

  const payId = randomId();
  await query.transaction(async () => {
    await query.run(
      `INSERT INTO payments (id, invoice_id, amount, method) VALUES (?, ?, ?, ?)`,
      payId, id, body.amount, body.method ?? null,
    );

    // Update payment status based on total paid vs invoice total
    const paidRows = await query.all('SELECT amount FROM payments WHERE invoice_id = ?', id);
    const totalPaid = paidRows.reduce((s, r) => s + (r.amount as number), 0);
    const invTotal = inv.total as number;
    let status = 'unpaid';
    if (totalPaid >= invTotal) status = 'paid';
    else if (totalPaid > 0) status = 'partial';
    await query.run(
      `UPDATE invoices SET payment_status = ?, updated_at = datetime('now') WHERE id = ?`,
      status, id,
    );
  });

  const row = await query.get('SELECT * FROM payments WHERE id = ?', payId);
  return c.json({ payment: row }, 201);
});

export default invoices;

// routes/customers.ts â€” admin CRUD + search for customers.
// Staff/customer cannot access these endpoints (admin only).
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { parsePagination, makeMeta } from '../lib/pagination.ts';

const customers = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const customerSchema = z.object({
  name: z.string().min(1).max(100),
  phone: z.string().optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().optional(),
  user_id: z.string().optional(),
});

const customerUpdateSchema = customerSchema.partial();

// All customer routes require admin role.
customers.use('*', authenticate, requireRole('admin'));

// GET /api/customers?q=searchterm&page=1&limit=20
customers.get('/', async (c) => {
  const q = (c.req.query('q') ?? '').trim();
  const { page, limit, offset } = parsePagination(c.req);

  let rows: Record<string, unknown>[];
  let total: number;
  if (q) {
    rows = await query.all(
      `SELECT c.*, u.email AS user_email, u.role
       FROM customers c LEFT JOIN users u ON c.user_id = u.id
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR u.email LIKE ?
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`, limit, offset,
    );
    const countRow = await query.get(
      `SELECT COUNT(*) AS cnt FROM customers c LEFT JOIN users u ON c.user_id = u.id
       WHERE c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR u.email LIKE ?`,
      `%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`,
    );
    total = (countRow?.cnt as number) ?? 0;
  } else {
    rows = await query.all(
      `SELECT c.*, u.email AS user_email, u.role
       FROM customers c LEFT JOIN users u ON c.user_id = u.id
       ORDER BY c.created_at DESC LIMIT ? OFFSET ?`,
      limit, offset,
    );
    const countRow = await query.get('SELECT COUNT(*) AS cnt FROM customers');
    total = (countRow?.cnt as number) ?? 0;
  }
  return c.json({ customers: rows, pagination: makeMeta(page, limit, total) });
});

// GET /api/customers/:id
customers.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await query.get(
    `SELECT c.*, u.email AS user_email, u.role
     FROM customers c LEFT JOIN users u ON c.user_id = u.id WHERE c.id = ?`,
    id,
  );
  if (!row) return c.json({ error: 'Customer not found' }, 404);
  return c.json({ customer: row });
});

// POST /api/customers
customers.post('/', zValidator('json', customerSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof customerSchema>;

  const userId = body.user_id ?? null;
  const customerId = randomId();

  await query.run(
    `INSERT INTO customers (id, user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
    customerId, userId, body.name, body.phone ?? null, body.email ?? null, body.address ?? null,
  );

  const row = await query.get('SELECT * FROM customers WHERE id = ?', customerId);
  return c.json({ customer: row }, 201);
});

// PUT /api/customers/:id
customers.put('/:id', zValidator('json', customerUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json' as never) as z.infer<typeof customerUpdateSchema>;

  const existing = await query.get('SELECT id FROM customers WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Customer not found' }, 404);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
  fields.push(`updated_at = NOW()`);
  values.push(id);

  await query.run(`UPDATE customers SET ${fields.join(', ')} WHERE id = ?`, ...values);
  const row = await query.get('SELECT * FROM customers WHERE id = ?', id);
  return c.json({ customer: row });
});

// DELETE /api/customers/:id
customers.delete('/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await query.get('SELECT id FROM customers WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Customer not found' }, 404);

  await query.run('DELETE FROM customers WHERE id = ?', id);
  return c.json({ message: 'Customer deleted' });
});

export default customers;


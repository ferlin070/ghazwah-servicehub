// routes/devices.ts — device management.
// admin/staff: full CRUD. customer: read own devices only.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { parsePagination, makeMeta } from '../lib/pagination.ts';

const devices = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const deviceSchema = z.object({
  customer_id: z.string().min(1),
  brand: z.string().min(1),
  model: z.string().min(1),
  serial_number: z.string().optional(),
  device_type: z.string().min(1),
  condition: z.string().optional(),
  accessories: z.string().optional(),
  notes: z.string().optional(),
});

const deviceUpdateSchema = deviceSchema.partial().omit({ customer_id: true });

devices.use('*', authenticate);

// GET /api/devices?customerId=...&q=serial
devices.get('/', async (c) => {
  const user = c.get('user')!;
  const customerId = c.req.query('customerId');
  const q = (c.req.query('q') ?? '').trim();
  const { page, limit, offset } = parsePagination(c.req);

  // Customers can only see their own devices
  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow) return c.json({ devices: [], pagination: makeMeta(page, limit, 0) });
    const cid = custRow.id as string;
    const countRow = await query.get('SELECT COUNT(*) AS cnt FROM devices WHERE customer_id = ?', cid);
    const total = countRow?.cnt as number;
    const rows = await query.all(
      `SELECT d.* FROM devices d WHERE d.customer_id = ? ORDER BY d.created_at DESC LIMIT ? OFFSET ?`,
      cid, limit, offset,
    );
    return c.json({ devices: rows, pagination: makeMeta(page, limit, total) });
  }

  // admin/staff
  const base = 'FROM devices';
  let where = '1=1';
  const params: unknown[] = [];
  if (customerId) { where += ' AND customer_id = ?'; params.push(customerId); }
  if (q) { where += ' AND (serial_number LIKE ? OR brand LIKE ? OR model LIKE ?)'; params.push(`%${q}%`, `%${q}%`, `%${q}%`); }

  const countRow = await query.get(`SELECT COUNT(*) AS cnt ${base} WHERE ${where}`, ...params);
  const total = countRow?.cnt as number;
  const rows = await query.all(
    `SELECT * ${base} WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return c.json({ devices: rows, pagination: makeMeta(page, limit, total) });
});

// GET /api/devices/:id
devices.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const row = await query.get('SELECT * FROM devices WHERE id = ?', id);
  if (!row) return c.json({ error: 'Device not found' }, 404);

  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow || row.customer_id !== custRow.id) {
      return c.json({ error: 'Forbidden: not your device' }, 403);
    }
  }
  return c.json({ device: row });
});

// POST /api/devices — admin/staff only
devices.post('/', authenticate, requireRole('admin', 'staff'), zValidator('json', deviceSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof deviceSchema>;
  const id = randomId();

  // Verify customer exists
  const cust = await query.get('SELECT id FROM customers WHERE id = ?', body.customer_id);
  if (!cust) return c.json({ error: 'Customer not found' }, 404);

  await query.run(
    `INSERT INTO devices (id, customer_id, brand, model, serial_number, device_type, condition, accessories, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, body.customer_id, body.brand, body.model, body.serial_number ?? null,
    body.device_type, body.condition ?? null, body.accessories ?? null, body.notes ?? null,
  );
  const row = await query.get('SELECT * FROM devices WHERE id = ?', id);
  return c.json({ device: row }, 201);
});

// PUT /api/devices/:id — admin/staff only
devices.put('/:id', authenticate, requireRole('admin', 'staff'), zValidator('json', deviceUpdateSchema), async (c) => {
  const id = c.req.param('id');
  const body = c.req.valid('json' as never) as z.infer<typeof deviceUpdateSchema>;
  const existing = await query.get('SELECT id FROM devices WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Device not found' }, 404);

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
  fields.push(`updated_at = datetime('now')`);
  values.push(id);

  await query.run(`UPDATE devices SET ${fields.join(', ')} WHERE id = ?`, ...values);
  const row = await query.get('SELECT * FROM devices WHERE id = ?', id);
  return c.json({ device: row });
});

// DELETE /api/devices/:id — admin only
devices.delete('/:id', authenticate, requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const existing = await query.get('SELECT id FROM devices WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Device not found' }, 404);

  await query.run('DELETE FROM devices WHERE id = ?', id);
  return c.json({ message: 'Device deleted' });
});

export default devices;

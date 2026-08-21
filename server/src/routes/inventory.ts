// routes/inventory.ts â€” spare parts inventory + low-stock warning.
// admin: full CRUD. staff: read + update quantities. customer: no access.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { parsePagination, makeMeta } from '../lib/pagination.ts';

const inventory = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const partSchema = z.object({
  part_name: z.string().min(1),
  sku: z.string().min(1),
  category: z.string().optional(),
  quantity: z.number().int().nonnegative().default(0),
  min_stock: z.number().int().nonnegative().default(0),
  cost: z.number().nonnegative().default(0),
  selling_price: z.number().nonnegative().default(0),
  supplier: z.string().optional(),
});

const partUpdateSchema = partSchema.partial();

inventory.use('*', authenticate, requireRole('admin', 'staff'));

// GET /api/inventory?lowStock=true
inventory.get('/', async (c) => {
  const lowStock = c.req.query('lowStock') === 'true';
  const { page, limit, offset } = parsePagination(c.req);
  const where = lowStock ? 'quantity <= min_stock' : '1=1';
  const countRow = await query.get(`SELECT COUNT(*) AS cnt FROM inventory WHERE ${where}`);
  const total = countRow?.cnt as number;
  const rows = await query.all(
    `SELECT * FROM inventory WHERE ${where} ORDER BY part_name ASC LIMIT ? OFFSET ?`,
    limit, offset,
  );
  return c.json({ inventory: rows, pagination: makeMeta(page, limit, total) });
});

// GET /api/inventory/:id
inventory.get('/:id', async (c) => {
  const id = c.req.param('id');
  const row = await query.get('SELECT * FROM inventory WHERE id = ?', id);
  if (!row) return c.json({ error: 'Part not found' }, 404);
  return c.json({ part: row });
});

// POST /api/inventory â€” admin only
inventory.post('/', requireRole('admin'), zValidator('json', partSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof partSchema>;

  // SKU uniqueness
  const dup = await query.get('SELECT id FROM inventory WHERE sku = ?', body.sku);
  if (dup) return c.json({ error: 'SKU already exists' }, 409);

  const id = randomId();
  await query.run(
    `INSERT INTO inventory (id, part_name, sku, category, quantity, min_stock, cost, selling_price, supplier)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, body.part_name, body.sku, body.category ?? null, body.quantity,
    body.min_stock, body.cost, body.selling_price, body.supplier ?? null,
  );
  const row = await query.get('SELECT * FROM inventory WHERE id = ?', id);
  return c.json({ part: row }, 201);
});

// PUT /api/inventory/:id â€” admin full, staff quantity only
inventory.put('/:id', zValidator('json', partUpdateSchema), async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = c.req.valid('json' as never) as z.infer<typeof partUpdateSchema>;

  const existing = await query.get('SELECT id FROM inventory WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Part not found' }, 404);

  // Staff can only update quantity (not cost/price)
  if (user.role === 'staff') {
    const allowed = { quantity: body.quantity };
    if (Object.keys(body).some((k) => k !== 'quantity')) {
      return c.json({ error: 'Staff can only update quantity' }, 403);
    }
    if (allowed.quantity === undefined) return c.json({ error: 'No fields to update' }, 400);
    await query.run(
      `UPDATE inventory SET quantity = ?, updated_at = NOW() WHERE id = ?`,
      allowed.quantity, id,
    );
  } else {
    const fields: string[] = [];
    const values: unknown[] = [];
    for (const [k, v] of Object.entries(body)) {
      fields.push(`${k} = ?`);
      values.push(v);
    }
    if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
    fields.push(`updated_at = NOW()`);
    values.push(id);
    await query.run(`UPDATE inventory SET ${fields.join(', ')} WHERE id = ?`, ...values);
  }

  const row = await query.get('SELECT * FROM inventory WHERE id = ?', id);
  return c.json({ part: row });
});

// DELETE /api/inventory/:id â€” admin only
inventory.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const existing = await query.get('SELECT id FROM inventory WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Part not found' }, 404);

  await query.run('DELETE FROM inventory WHERE id = ?', id);
  return c.json({ message: 'Part deleted' });
});

export default inventory;


// routes/workOrders.ts — work order / repair system.
// admin/staff: full CRUD + status flow. customer: read own work orders only.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { parsePagination, makeMeta } from '../lib/pagination.ts';

const workOrders = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const STATUS_FLOW = [
  'received', 'diagnosing', 'waiting_approval', 'repairing', 'ready_for_pickup', 'completed',
] as const;

const workOrderSchema = z.object({
  customer_id: z.string().min(1),
  device_id: z.string().min(1),
  problem: z.string().min(1),
  diagnosis: z.string().optional(),
  technician_id: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  estimated_cost: z.number().nonnegative().optional(),
});

const workOrderUpdateSchema = z.object({
  problem: z.string().min(1).optional(),
  diagnosis: z.string().optional(),
  technician_id: z.string().optional(),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
  status: z.enum(STATUS_FLOW).optional(),
  estimated_cost: z.number().nonnegative().optional(),
  final_cost: z.number().nonnegative().optional(),
  completed_date: z.string().optional(),
});

workOrders.use('*', authenticate);

// GET /api/work-orders?status=...&customerId=...
workOrders.get('/', async (c) => {
  const user = c.get('user')!;
  const status = c.req.query('status');
  const customerId = c.req.query('customerId');
  const { page, limit, offset } = parsePagination(c.req);

  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow) return c.json({ work_orders: [], pagination: makeMeta(page, limit, 0) });
    const cid = custRow.id as string;
    const countRow = await query.get('SELECT COUNT(*) AS cnt FROM work_orders WHERE customer_id = ?', cid);
    const total = countRow?.cnt as number;
    const rows = await query.all(
      `SELECT w.*, c.name AS customer_name, d.brand, d.model
       FROM work_orders w
       JOIN customers c ON w.customer_id = c.id
       JOIN devices d ON w.device_id = d.id
       WHERE w.customer_id = ?
       ORDER BY w.created_at DESC
       LIMIT ? OFFSET ?`,
      cid, limit, offset,
    );
    return c.json({ work_orders: rows, pagination: makeMeta(page, limit, total) });
  }

  // staff: only their assigned work orders
  let rows: Record<string, unknown>[];
  let total: number;
  const base = `FROM work_orders w JOIN customers c ON w.customer_id = c.id JOIN devices d ON w.device_id = d.id WHERE w.technician_id = ?`;
  const select = `SELECT w.*, c.name AS customer_name, d.brand, d.model`;

  if (user.role === 'staff') {
    const countRow = await query.get(`SELECT COUNT(*) AS cnt ${base}`, user.userId);
    total = countRow?.cnt as number;
    if (status) {
      const countStatus = await query.get(`SELECT COUNT(*) AS cnt ${base} AND w.status = ?`, user.userId, status);
      total = countStatus?.cnt as number;
      rows = await query.all(
        `${select} ${base} AND w.status = ? ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
        user.userId, status, limit, offset,
      );
    } else {
      rows = await query.all(
        `${select} ${base} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
        user.userId, limit, offset,
      );
    }
    return c.json({ work_orders: rows, pagination: makeMeta(page, limit, total) });
  }

  // admin: all
  const adminBase = `FROM work_orders w JOIN customers c ON w.customer_id = c.id JOIN devices d ON w.device_id = d.id`;
  let where = '1=1';
  const params: unknown[] = [];
  if (status) { where += ' AND w.status = ?'; params.push(status); }
  if (customerId) { where += ' AND w.customer_id = ?'; params.push(customerId); }

  const countRow = await query.get(`SELECT COUNT(*) AS cnt ${adminBase} WHERE ${where}`, ...params);
  total = countRow?.cnt as number;
  rows = await query.all(
    `${select} ${adminBase} WHERE ${where} ORDER BY w.created_at DESC LIMIT ? OFFSET ?`,
    ...params, limit, offset,
  );
  return c.json({ work_orders: rows, pagination: makeMeta(page, limit, total) });
});

// GET /api/work-orders/:id
workOrders.get('/:id', async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const row = await query.get(
    `SELECT w.*, c.name AS customer_name, d.brand, d.model, d.serial_number
     FROM work_orders w
     JOIN customers c ON w.customer_id = c.id
     JOIN devices d ON w.device_id = d.id
     WHERE w.id = ?`,
    id,
  );
  if (!row) return c.json({ error: 'Work order not found' }, 404);

  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow || row.customer_id !== custRow.id) {
      return c.json({ error: 'Forbidden: not your work order' }, 403);
    }
  } else if (user.role === 'staff') {
    // Staff can see work orders assigned to them or all if admin
    if (row.technician_id !== user.userId) {
      return c.json({ error: 'Forbidden: not assigned to you' }, 403);
    }
  }
  return c.json({ work_order: row });
});

// POST /api/work-orders — admin/staff
workOrders.post('/', requireRole('admin', 'staff'), zValidator('json', workOrderSchema), async (c) => {
  const user = c.get('user')!;
  const body = c.req.valid('json' as never) as z.infer<typeof workOrderSchema>;

  // Verify customer + device exist
  const cust = await query.get('SELECT id FROM customers WHERE id = ?', body.customer_id);
  if (!cust) return c.json({ error: 'Customer not found' }, 404);
  const dev = await query.get('SELECT id, customer_id FROM devices WHERE id = ?', body.device_id);
  if (!dev) return c.json({ error: 'Device not found' }, 404);
  if (dev.customer_id !== body.customer_id) {
    return c.json({ error: 'Device does not belong to this customer' }, 400);
  }

  const id = randomId();
  // Generate order number: WO-YYYY-XXXX (incremental)
  const year = new Date().getFullYear();
  const countRow = await query.get(
    `SELECT COUNT(*) AS cnt FROM work_orders WHERE order_number LIKE ?`,
    `WO-${year}-%`,
  );
  const nextNum = ((countRow?.cnt as number) ?? 0) + 1;
  const orderNumber = `WO-${year}-${String(nextNum).padStart(4, '0')}`;

  await query.transaction(async () => {
    await query.run(
      `INSERT INTO work_orders (id, order_number, customer_id, device_id, problem, diagnosis, technician_id, priority, status, estimated_cost)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'received', ?)`,
      id, orderNumber, body.customer_id, body.device_id, body.problem,
      body.diagnosis ?? null, body.technician_id ?? null, body.priority,
      body.estimated_cost ?? null,
    );
    // Auto-add first timeline event: device_received
    const tlId = randomId();
    await query.run(
      `INSERT INTO repair_timeline (id, work_order_id, event, actor_id, description)
       VALUES (?, ?, 'device_received', ?, 'Device received at service center')`,
      tlId, id, user.userId,
    );
  });

  const row = await query.get('SELECT * FROM work_orders WHERE id = ?', id);
  return c.json({ work_order: row }, 201);
});

// PUT /api/work-orders/:id — admin/staff
workOrders.put('/:id', requireRole('admin', 'staff'), zValidator('json', workOrderUpdateSchema), async (c) => {
  const user = c.get('user')!;
  const id = c.req.param('id');
  const body = c.req.valid('json' as never) as z.infer<typeof workOrderUpdateSchema>;

  const existing = await query.get('SELECT * FROM work_orders WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Work order not found' }, 404);

  // staff can only update their own assigned work orders
  if (user.role === 'staff' && existing.technician_id !== user.userId) {
    return c.json({ error: 'Forbidden: not assigned to you' }, 403);
  }

  const fields: string[] = [];
  const values: unknown[] = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === 'status') {
      // Validate status flow: can't go backwards
      const currentIdx = STATUS_FLOW.indexOf(existing.status as typeof STATUS_FLOW[number]);
      const newIdx = STATUS_FLOW.indexOf(v as typeof STATUS_FLOW[number]);
      if (newIdx < currentIdx) {
        return c.json({ error: 'Cannot revert status' }, 400);
      }
      // If completing, set completed_date
      if (v === 'completed' && !existing.completed_date) {
        fields.push('completed_date = datetime(\'now\')');
      }
      // Auto-add timeline event for status change
      const eventMap: Record<string, string> = {
        diagnosing: 'diagnosis_started',
        waiting_approval: 'diagnosis_completed',
        repairing: 'repair_started',
        ready_for_pickup: 'repair_completed',
        completed: 'completed',
      };
      const eventName = eventMap[v as string];
      if (eventName) {
        const tlId = randomId();
        await query.run(
          `INSERT INTO repair_timeline (id, work_order_id, event, actor_id, description)
           VALUES (?, ?, ?, ?, ?)`,
          tlId, id, eventName, user.userId, `Status changed to ${v}`,
        );
      }
    }
    fields.push(`${k} = ?`);
    values.push(v);
  }
  if (fields.length === 0) return c.json({ error: 'No fields to update' }, 400);
  fields.push(`updated_at = datetime('now')`);
  values.push(id);

  await query.run(`UPDATE work_orders SET ${fields.join(', ')} WHERE id = ?`, ...values);
  const row = await query.get('SELECT * FROM work_orders WHERE id = ?', id);
  return c.json({ work_order: row });
});

// DELETE /api/work-orders/:id — admin only
workOrders.delete('/:id', requireRole('admin'), async (c) => {
  const id = c.req.param('id');
  const existing = await query.get('SELECT id FROM work_orders WHERE id = ?', id);
  if (!existing) return c.json({ error: 'Work order not found' }, 404);

  await query.run('DELETE FROM work_orders WHERE id = ?', id);
  return c.json({ message: 'Work order deleted' });
});

export default workOrders;

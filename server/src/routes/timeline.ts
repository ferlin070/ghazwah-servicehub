// routes/timeline.ts — repair timeline for a work order.
// admin/staff: read + add events. customer: read own only.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';

const timeline = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const eventSchema = z.object({
  event: z.enum([
    'device_received', 'diagnosis_started', 'diagnosis_completed',
    'customer_approval', 'repair_started', 'repair_completed',
    'ready_for_pickup', 'completed',
  ]),
  description: z.string().optional(),
});

timeline.use('*', authenticate);

// GET /api/work-orders/:woId/timeline
timeline.get('/', async (c) => {
  const user = c.get('user')!;
  const woId = c.req.param('woId');

  const wo = await query.get('SELECT id, customer_id, technician_id FROM work_orders WHERE id = ?', woId);
  if (!wo) return c.json({ error: 'Work order not found' }, 404);

  // Authorization
  if (user.role === 'customer') {
    const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
    if (!custRow || wo.customer_id !== custRow.id) {
      return c.json({ error: 'Forbidden' }, 403);
    }
  } else if (user.role === 'staff' && wo.technician_id !== user.userId) {
    return c.json({ error: 'Forbidden: not assigned to you' }, 403);
  }

  const rows = await query.all(
    `SELECT t.*, u.name AS actor_name
     FROM repair_timeline t LEFT JOIN users u ON t.actor_id = u.id
     WHERE t.work_order_id = ? ORDER BY t.created_at ASC`,
    woId,
  );
  return c.json({ timeline: rows });
});

// POST /api/work-orders/:woId/timeline — admin/staff only
timeline.post('/', requireRole('admin', 'staff'), zValidator('json', eventSchema), async (c) => {
  const user = c.get('user')!;
  const woId = c.req.param('woId');
  const body = c.req.valid('json' as never) as z.infer<typeof eventSchema>;

  const wo = await query.get('SELECT id, technician_id FROM work_orders WHERE id = ?', woId);
  if (!wo) return c.json({ error: 'Work order not found' }, 404);

  if (user.role === 'staff' && wo.technician_id !== user.userId) {
    return c.json({ error: 'Forbidden: not assigned to you' }, 403);
  }

  const id = randomId();
  await query.run(
    `INSERT INTO repair_timeline (id, work_order_id, event, actor_id, description)
     VALUES (?, ?, ?, ?, ?)`,
    id, woId, body.event, user.userId, body.description ?? null,
  );
  const row = await query.get('SELECT * FROM repair_timeline WHERE id = ?', id);
  return c.json({ event: row }, 201);
});

export default timeline;

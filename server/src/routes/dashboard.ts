// routes/dashboard.ts — role-based dashboard stats.
// admin: totals. staff: my work orders. customer: my devices/repairs/invoices.
import { Hono } from 'hono';
import { query } from '../lib/query.ts';
import { authenticate } from '../middleware/auth.ts';

const dashboard = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

dashboard.use('*', authenticate);

dashboard.get('/', async (c) => {
  const user = c.get('user')!;

  if (user.role === 'admin') {
    const totalCustomers = await query.get('SELECT COUNT(*) AS cnt FROM customers');
    const totalWorkOrders = await query.get('SELECT COUNT(*) AS cnt FROM work_orders');
    const pending = await query.get(
      `SELECT COUNT(*) AS cnt FROM work_orders WHERE status IN ('received', 'waiting_approval')`,
    );
    const repairing = await query.get(`SELECT COUNT(*) AS cnt FROM work_orders WHERE status = 'repairing'`);
    const completed = await query.get(`SELECT COUNT(*) AS cnt FROM work_orders WHERE status = 'completed'`);
    const revenueRow = await query.get(
      `SELECT COALESCE(SUM(total), 0) AS total FROM invoices WHERE payment_status = 'paid'`,
    );
    const recentActivity = await query.all(
      `SELECT t.event, t.description, t.created_at, u.name AS actor_name, w.order_number
       FROM repair_timeline t
       JOIN work_orders w ON t.work_order_id = w.id
       LEFT JOIN users u ON t.actor_id = u.id
       ORDER BY t.created_at DESC LIMIT 10`,
    );

    return c.json({
      role: 'admin',
      stats: {
        total_customers: totalCustomers?.cnt ?? 0,
        total_work_orders: totalWorkOrders?.cnt ?? 0,
        pending: pending?.cnt ?? 0,
        repairing: repairing?.cnt ?? 0,
        completed: completed?.cnt ?? 0,
        revenue: revenueRow?.total ?? 0,
      },
      recent_activity: recentActivity,
    });
  }

  if (user.role === 'staff') {
    const myWorkOrders = await query.all(
      `SELECT w.id, w.order_number, w.status, w.priority, w.problem, c.name AS customer_name
       FROM work_orders w JOIN customers c ON w.customer_id = c.id
       WHERE w.technician_id = ? ORDER BY w.created_at DESC`,
      user.userId,
    );
    const todayTasks = await query.all(
      `SELECT w.id, w.order_number, w.status, w.problem
       FROM work_orders w
       WHERE w.technician_id = ? AND w.status IN ('received', 'diagnosing', 'repairing')
       ORDER BY w.priority DESC`,
      user.userId,
    );

    return c.json({
      role: 'staff',
      stats: {
        my_work_orders: myWorkOrders.length,
        active: myWorkOrders.filter((w) => w.status !== 'completed').length,
        today_tasks: todayTasks.length,
      },
      work_orders: myWorkOrders,
      today_tasks: todayTasks,
    });
  }

  // customer
  const custRow = await query.get('SELECT id FROM customers WHERE user_id = ?', user.userId);
  if (!custRow) return c.json({ role: 'customer', stats: {}, devices: [], work_orders: [], invoices: [] });
  const cid = custRow.id as string;

  const devices = await query.all(
    'SELECT id, brand, model, serial_number, device_type FROM devices WHERE customer_id = ?',
    cid,
  );
  const workOrders = await query.all(
    `SELECT w.id, w.order_number, w.status, w.problem, w.created_at, w.completed_date
     FROM work_orders w WHERE w.customer_id = ? ORDER BY w.created_at DESC`,
    cid,
  );
  const invoices = await query.all(
    `SELECT i.id, i.invoice_number, i.total, i.payment_status
     FROM invoices i WHERE i.customer_id = ? ORDER BY i.created_at DESC`,
    cid,
  );

  return c.json({
    role: 'customer',
    stats: {
      devices: devices.length,
      active_repairs: workOrders.filter((w) => w.status !== 'completed').length,
      invoices: invoices.length,
    },
    devices,
    work_orders: workOrders,
    invoices,
  });
});

export default dashboard;

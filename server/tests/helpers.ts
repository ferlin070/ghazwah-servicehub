// helpers.ts — shared test app builder + PostgreSQL test DB setup.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import auth from '../src/routes/auth.ts';
import customers from '../src/routes/customers.ts';
import devices from '../src/routes/devices.ts';
import workOrders from '../src/routes/workOrders.ts';
import timeline from '../src/routes/timeline.ts';
import inventory from '../src/routes/inventory.ts';
import invoices from '../src/routes/invoices.ts';
import search from '../src/routes/search.ts';
import dashboard from '../src/routes/dashboard.ts';
import { authenticate } from '../src/middleware/auth.ts';
import { pool } from '../src/db/db.ts';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

export async function buildApp(): Promise<{ server: ReturnType<typeof serve>; baseUrl: string }> {
  // Apply fresh schema
  const schema = readFileSync(join(MIGRATIONS_DIR, '001_init.sql'), 'utf8');
  const tables = ['email_verification_tokens', 'file_uploads', 'audit_logs', 'refresh_tokens', 'payments', 'invoice_items', 'invoices', 'inventory', 'repair_timeline', 'work_orders', 'devices', 'customers', 'users'];
  for (const t of tables) {
    await pool.query(`DELETE FROM ${t};`);
  }
  await pool.query(schema);

  const app = new Hono<{ Variables: { user: { userId: string; role: string } | null } }>();
  app.use('*', cors());
  app.use('*', authenticate);
  app.route('/api/auth', auth);
  app.route('/api/customers', customers);
  app.route('/api/devices', devices);
  app.route('/api/work-orders', workOrders);
  app.route('/api/work-orders/:woId/timeline', timeline);
  app.route('/api/inventory', inventory);
  app.route('/api/invoices', invoices);
  app.route('/api/search', search);
  app.route('/api/dashboard', dashboard);

  return new Promise((resolve) => {
    const server = serve({ fetch: app.fetch, port: 0 }, (info) => {
      resolve({ server, baseUrl: `http://localhost:${info.port}` });
    });
  });
}

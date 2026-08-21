// index.ts — Hono app entry. Mounts all API routes, CORS, health check.
import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { serveStatic } from '@hono/node-server/serve-static';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import auth from './routes/auth.ts';
import customers from './routes/customers.ts';
import devices from './routes/devices.ts';
import workOrders from './routes/workOrders.ts';
import timeline from './routes/timeline.ts';
import inventory from './routes/inventory.ts';
import invoices from './routes/invoices.ts';
import search from './routes/search.ts';
import dashboard from './routes/dashboard.ts';
import uploads from './routes/uploads.ts';
import { sseManager } from './lib/sse.ts';
import { authenticate } from './middleware/auth.ts';
import { errorHandler } from './middleware/errorHandler.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));

const app = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

app.use('*', logger());
app.use(
  '*',
  cors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  }),
);
app.use('*', authenticate);

app.get('/health', (c) => c.json({ status: 'ok', time: new Date().toISOString() }));

// SSE endpoint for real-time updates
app.get('/api/events', (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Authentication required' }, 401);

  const stream = sseManager.createStream(user.userId);
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
});

app.route('/api/auth', auth);
app.route('/api/customers', customers);
app.route('/api/devices', devices);
app.route('/api/work-orders', workOrders);
app.route('/api/work-orders/:woId/timeline', timeline);
app.route('/api/inventory', inventory);
app.route('/api/invoices', invoices);
app.route('/api/search', search);
app.route('/api/dashboard', dashboard);
app.route('/api/uploads', uploads);

app.onError(errorHandler);

// Serve frontend static files in production (client/dist/)
const clientDist = join(__dirname, '..', '..', 'client', 'dist');
if (existsSync(clientDist)) {
  app.use('/*', serveStatic({ root: clientDist }));
  // SPA fallback: serve index.html for non-API routes
  app.get('/*', (c) => {
    const indexPath = join(clientDist, 'index.html');
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf8'));
    }
    return c.notFound();
  });
}

const port = Number(process.env.PORT ?? 3000);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`  [server] Ghazwah ServiceHub API running on http://localhost:${info.port}`);
  console.log(`  [server] Routes:`);
  console.log(`           /health, /api/auth, /api/customers, /api/devices`);
  console.log(`           /api/work-orders, /api/work-orders/:id/timeline`);
  console.log(`           /api/inventory, /api/invoices, /api/search, /api/dashboard`);
  console.log(`           /api/uploads, /api/events (SSE)`);
});

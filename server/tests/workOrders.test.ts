// workOrders.test.ts — work order CRUD + status flow + timeline tests.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './helpers.ts';
import { query } from '../src/lib/query.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import { randomId } from '../src/lib/id.ts';

let baseUrl: string;
let server: ReturnType<typeof import('@hono/node-server')['serve']>;
let adminToken: string;
let staffToken: string;
let customerToken: string;
let staffUserId: string;
let customerId: string;
let deviceId: string;
let workOrderId: string;

beforeAll(async () => {
  ({ server, baseUrl } = await buildApp());

  // Create admin directly in DB
  const adminHash = await hashPassword('Testpass123');
  const adminUid = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'admin')`,
    adminUid, 'wo-admin@ghazwah.test', 'WO Admin', adminHash,
  );
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wo-admin@ghazwah.test', password: 'Testpass123' }),
  });
  adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;

  // Create staff directly in DB
  const staffHash = await hashPassword('Testpass123');
  staffUserId = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'staff')`,
    staffUserId, 'wo-staff@ghazwah.test', 'WO Staff', staffHash,
  );
  const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wo-staff@ghazwah.test', password: 'Testpass123' }),
  });
  staffToken = ((await staffLogin.json()) as { accessToken: string }).accessToken;

  // Register customer via public endpoint
  const custReg = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'wo-customer@ghazwah.test', name: 'WO Customer', password: 'Testpass123' }),
  });
  customerToken = ((await custReg.json()) as { accessToken: string }).accessToken;

  // Get customer id
  const custRow = await query.get('SELECT id FROM customers WHERE name = ?', 'WO Customer');
  customerId = custRow?.id as string;

  // Admin creates a device
  const devRes = await fetch(`${baseUrl}/api/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ customer_id: customerId, brand: 'Dell', model: 'Latitude 5420', serial_number: 'DL5420-TEST', device_type: 'laptop', condition: 'Good' }),
  });
  deviceId = ((await devRes.json()) as { device: { id: string } }).device.id;

  // Admin creates a work order
  const woRes = await fetch(`${baseUrl}/api/work-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ customer_id: customerId, device_id: deviceId, problem: 'Screen not working', technician_id: staffUserId, priority: 'high', estimated_cost: 200 }),
  });
  workOrderId = ((await woRes.json()) as { work_order: { id: string } }).work_order.id;
});

afterAll(() => {
  server?.close();
});

async function api(path: string, init?: RequestInit & { token?: string }): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if ((init as { token?: string } | undefined)?.token) {
    headers.Authorization = `Bearer ${(init as { token?: string }).token}`;
  }
  return fetch(`${baseUrl}${path}`, { ...init, headers });
}

describe('work orders', () => {
  it('admin can list all work orders', async () => {
    const res = await api('/api/work-orders', { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { work_orders: unknown[] };
    expect(data.work_orders.length).toBeGreaterThan(0);
  });

  it('staff sees only assigned work orders', async () => {
    const res = await api('/api/work-orders', { token: staffToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { work_orders: { problem: string }[] };
    expect(data.work_orders.some((w) => w.problem === 'Screen not working')).toBe(true);
  });

  it('customer sees only own work orders', async () => {
    const res = await api('/api/work-orders', { token: customerToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { work_orders: { problem: string }[] };
    expect(data.work_orders.some((w) => w.problem === 'Screen not working')).toBe(true);
  });

  it('admin can update work order status', async () => {
    const res = await api(`/api/work-orders/${workOrderId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ status: 'diagnosing', diagnosis: 'Screen panel failure detected' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { work_order: { status: string; diagnosis: string } };
    expect(data.work_order.status).toBe('diagnosing');
    expect(data.work_order.diagnosis).toBe('Screen panel failure detected');
  });

  it('cannot revert status backwards', async () => {
    const res = await api(`/api/work-orders/${workOrderId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ status: 'received' }),
    });
    expect(res.status).toBe(400);
  });

  it('work order has timeline events', async () => {
    const res = await api(`/api/work-orders/${workOrderId}/timeline`, { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { timeline: { event: string }[] };
    expect(data.timeline.length).toBeGreaterThan(0);
    expect(data.timeline[0]?.event).toBe('device_received');
  });

  it('customer can view own work order timeline', async () => {
    const res = await api(`/api/work-orders/${workOrderId}/timeline`, { token: customerToken });
    expect(res.status).toBe(200);
  });

  it('rejects creating work order with non-existent customer', async () => {
    const res = await api('/api/work-orders', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ customer_id: 'nonexistent', device_id: deviceId, problem: 'test' }),
    });
    expect(res.status).toBe(404);
  });

  it('rejects creating work order with device belonging to different customer', async () => {
    // Register another customer
    await fetch(`${baseUrl}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'wo-cust2@ghazwah.test', name: 'WO Customer 2', password: 'Testpass123' }),
    });
    const cust2Row = await query.get('SELECT id FROM customers WHERE name = ?', 'WO Customer 2');
    const cid2 = cust2Row?.id as string;

    const res = await api('/api/work-orders', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ customer_id: cid2, device_id: deviceId, problem: 'mismatch test' }),
    });
    expect(res.status).toBe(400);
  });
});

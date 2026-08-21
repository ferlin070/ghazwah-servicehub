// invoices.test.ts — invoice generation + payment status tests.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './helpers.ts';
import { query } from '../src/lib/query.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import { randomId } from '../src/lib/id.ts';

let baseUrl: string;
let server: ReturnType<typeof import('@hono/node-server')['serve']>;
let adminToken: string;
let customerToken: string;
let customerId: string;
let deviceId: string;
let workOrderId: string;
let invoiceId: string;

beforeAll(async () => {
  ({ server, baseUrl } = await buildApp());

  // Create admin directly in DB
  const adminHash = await hashPassword('Testpass123');
  const adminUid = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'admin')`,
    adminUid, 'inv-admin@ghazwah.test', 'Inv Admin', adminHash,
  );
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inv-admin@ghazwah.test', password: 'Testpass123' }),
  });
  adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;

  // Register customer via public endpoint
  const custReg = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'inv-customer@ghazwah.test', name: 'Inv Customer', password: 'Testpass123' }),
  });
  customerToken = ((await custReg.json()) as { accessToken: string }).accessToken;

  const custRow = await query.get('SELECT id FROM customers WHERE name = ?', 'Inv Customer');
  customerId = custRow?.id as string;

  // Create device
  const devRes = await fetch(`${baseUrl}/api/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ customer_id: customerId, brand: 'HP', model: 'EliteBook', serial_number: 'HPEB-INV', device_type: 'laptop' }),
  });
  deviceId = ((await devRes.json()) as { device: { id: string } }).device.id;

  // Create work order
  const woRes = await fetch(`${baseUrl}/api/work-orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
    body: JSON.stringify({ customer_id: customerId, device_id: deviceId, problem: 'Broken screen' }),
  });
  workOrderId = ((await woRes.json()) as { work_order: { id: string } }).work_order.id;

  // Advance status to completed
  for (const status of ['diagnosing', 'waiting_approval', 'repairing', 'ready_for_pickup', 'completed']) {
    await fetch(`${baseUrl}/api/work-orders/${workOrderId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ status }),
    });
  }
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

describe('invoices', () => {
  it('admin can generate an invoice', async () => {
    const res = await api('/api/invoices', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        customer_id: customerId,
        work_order_id: workOrderId,
        repair_description: 'Screen replacement',
        labour: 80,
        discount: 10,
        tax: 5,
        items: [
          { description: 'Screen panel 14"', quantity: 1, unit_price: 120 },
          { description: 'Repair labor', quantity: 1, unit_price: 0 },
        ],
      }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { invoice: { id: string; total: number; payment_status: string } };
    expect(data.invoice.payment_status).toBe('unpaid');
    expect(data.invoice.total).toBe(195);
    invoiceId = data.invoice.id;
  });

  it('admin can list invoices', async () => {
    const res = await api('/api/invoices', { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { invoices: unknown[] };
    expect(data.invoices.length).toBeGreaterThan(0);
  });

  it('customer can see own invoices', async () => {
    const res = await api('/api/invoices', { token: customerToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { invoices: { invoice_number: string }[] };
    expect(data.invoices.length).toBeGreaterThan(0);
  });

  it('invoice detail includes items + payments', async () => {
    const res = await api(`/api/invoices/${invoiceId}`, { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { invoice: { invoice_number: string }; items: unknown[]; payments: unknown[] };
    expect(data.items.length).toBe(2);
    expect(data.payments.length).toBe(0);
  });

  it('admin can record a partial payment', async () => {
    const res = await api(`/api/invoices/${invoiceId}/payments`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ amount: 100, method: 'cash' }),
    });
    expect(res.status).toBe(201);
    const invRes = await api(`/api/invoices/${invoiceId}`, { token: adminToken });
    const invData = (await invRes.json()) as { invoice: { payment_status: string } };
    expect(invData.invoice.payment_status).toBe('partial');
  });

  it('admin can record full payment → status becomes paid', async () => {
    const res = await api(`/api/invoices/${invoiceId}/payments`, {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ amount: 95, method: 'transfer' }),
    });
    expect(res.status).toBe(201);
    const invRes = await api(`/api/invoices/${invoiceId}`, { token: adminToken });
    const invData = (await invRes.json()) as { invoice: { payment_status: string } };
    expect(invData.invoice.payment_status).toBe('paid');
  });

  it('rejects invalid invoice creation (missing customer)', async () => {
    const res = await api('/api/invoices', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ customer_id: 'nonexistent', work_order_id: workOrderId }),
    });
    expect(res.status).toBe(404);
  });
});

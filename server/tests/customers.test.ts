// customers.test.ts — customer CRUD + authorization tests.
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
let testCustomerId: string;

beforeAll(async () => {
  ({ server, baseUrl } = await buildApp());

  // Create admin/staff via direct DB insert (admin-register requires admin auth)
  const adminHash = await hashPassword('Testpass123');
  const adminUid = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'admin')`,
    adminUid, 'custadmin@ghazwah.test', 'Cust Admin', adminHash,
  );
  const adminLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'custadmin@ghazwah.test', password: 'Testpass123' }),
  });
  adminToken = ((await adminLogin.json()) as { accessToken: string }).accessToken;

  const staffHash = await hashPassword('Testpass123');
  const staffUid = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'staff')`,
    staffUid, 'custstaff@ghazwah.test', 'Cust Staff', staffHash,
  );
  const staffLogin = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'custstaff@ghazwah.test', password: 'Testpass123' }),
  });
  staffToken = ((await staffLogin.json()) as { accessToken: string }).accessToken;

  // Register customer via public endpoint
  const customerLogin = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'custuser@ghazwah.test', name: 'Cust User', password: 'Testpass123' }),
  });
  customerToken = ((await customerLogin.json()) as { accessToken: string }).accessToken;
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

describe('customer CRUD', () => {
  it('admin can create a customer', async () => {
    const res = await api('/api/customers', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Test Customer', phone: '0199999999', email: 'testcust@example.com', address: 'Test Address' }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { customer: { id: string; name: string } };
    expect(data.customer.name).toBe('Test Customer');
    testCustomerId = data.customer.id;
  });

  it('admin can list customers', async () => {
    const res = await api('/api/customers', { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { customers: unknown[] };
    expect(data.customers.length).toBeGreaterThan(0);
  });

  it('admin can search customers', async () => {
    const res = await api('/api/customers?q=Test%20Customer', { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { customers: { name: string }[] };
    expect(data.customers.some((c) => c.name === 'Test Customer')).toBe(true);
  });

  it('admin can get a customer by id', async () => {
    const res = await api(`/api/customers/${testCustomerId}`, { token: adminToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { customer: { name: string } };
    expect(data.customer.name).toBe('Test Customer');
  });

  it('admin can update a customer', async () => {
    const res = await api(`/api/customers/${testCustomerId}`, {
      method: 'PUT',
      token: adminToken,
      body: JSON.stringify({ name: 'Updated Customer' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { customer: { name: string } };
    expect(data.customer.name).toBe('Updated Customer');
  });

  it('admin can delete a customer', async () => {
    const res = await api(`/api/customers/${testCustomerId}`, {
      method: 'DELETE',
      token: adminToken,
    });
    expect(res.status).toBe(200);
    const getRes = await api(`/api/customers/${testCustomerId}`, { token: adminToken });
    expect(getRes.status).toBe(404);
  });

  it('staff is forbidden from customer routes', async () => {
    const res = await api('/api/customers', { token: staffToken });
    expect(res.status).toBe(403);
  });

  it('customer is forbidden from customer routes', async () => {
    const res = await api('/api/customers', { token: customerToken });
    expect(res.status).toBe(403);
  });

  it('rejects invalid email on customer create', async () => {
    const res = await api('/api/customers', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({ name: 'Bad Email', email: 'notanemail' }),
    });
    expect(res.status).toBe(400);
  });
});

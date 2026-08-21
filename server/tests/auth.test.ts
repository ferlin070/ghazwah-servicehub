// auth.test.ts — auth + role authorization tests.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from './helpers.ts';
import { query } from '../src/lib/query.ts';
import { hashPassword } from '../src/lib/crypto.ts';
import { randomId } from '../src/lib/id.ts';

let baseUrl: string;
let server: ReturnType<typeof import('@hono/node-server')['serve']>;

beforeAll(async () => {
  ({ server, baseUrl } = await buildApp());

  // Insert a known admin user for login tests
  const hash = await hashPassword('Testpass123');
  const uid = randomId();
  await query.run(
    `INSERT INTO users (id, email, name, password, role) VALUES (?, ?, ?, ?, 'admin')`,
    uid, 'testadmin@ghazwah.test', 'Test Admin', hash,
  );
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

describe('auth', () => {
  it('registers a new customer and returns tokens', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'newcustomer@ghazwah.test', name: 'New Customer', password: 'Newpass123' }),
    });
    expect(res.status).toBe(201);
    const data = (await res.json()) as { user: { role: string }; accessToken: string; refreshToken: string };
    expect(data.user.role).toBe('customer');
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
    const cRow = await query.get('SELECT name FROM customers WHERE name = ?', 'New Customer');
    expect(cRow).toBeTruthy();
  });

  it('rejects duplicate email on register', async () => {
    const res = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', name: 'Dup', password: 'Whatever123' }),
    });
    expect(res.status).toBe(409);
  });

  it('logs in with correct credentials', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { user: { email: string }; accessToken: string; refreshToken: string };
    expect(data.user.email).toBe('testadmin@ghazwah.test');
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
  });

  it('rejects wrong password', async () => {
    const res = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'wrongpassword' }),
    });
    expect(res.status).toBe(401);
  });

  it('GET /me returns profile with valid token', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    const { accessToken } = (await login.json()) as { accessToken: string };
    const res = await api('/api/auth/me', { token: accessToken });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { user: { email: string; role: string } };
    expect(data.user.email).toBe('testadmin@ghazwah.test');
    expect(data.user.role).toBe('admin');
  });

  it('GET /me rejects no token', async () => {
    const res = await api('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('refresh token returns new access token', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    const { refreshToken } = (await login.json()) as { refreshToken: string };
    const res = await api('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as { accessToken: string; refreshToken: string };
    expect(data.accessToken).toBeTruthy();
    expect(data.refreshToken).toBeTruthy();
  });

  it('revoked refresh token is rejected', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    const { refreshToken } = (await login.json()) as { refreshToken: string };
    // Logout (revokes refresh token)
    await api('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    // Try to refresh with revoked token
    const res = await api('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    expect(res.status).toBe(401);
  });

  it('never returns password/hash in any auth response', async () => {
    const login = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    const text = await login.text();
    expect(text).not.toContain('password');
    expect(text).not.toContain('$2a$');
    expect(text).not.toContain('$2b$');

    const meLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    const { accessToken } = (await meLogin.json()) as { accessToken: string };
    const me = await api('/api/auth/me', { token: accessToken });
    const meText = await me.text();
    expect(meText).not.toContain('password');
    expect(meText).not.toContain('$2a$');
    expect(meText).not.toContain('$2b$');
  });
});

describe('role authorization', () => {
  let adminToken: string;
  let customerToken: string;

  beforeAll(async () => {
    const aLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'testadmin@ghazwah.test', password: 'Testpass123' }),
    });
    adminToken = ((await aLogin.json()) as { accessToken: string }).accessToken;

    await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email: 'rolecustomer@ghazwah.test', name: 'Role Customer', password: 'Custpass123' }),
    });
    const cLogin = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'rolecustomer@ghazwah.test', password: 'Custpass123' }),
    });
    customerToken = ((await cLogin.json()) as { accessToken: string }).accessToken;
  });

  it('admin can access /admin-only', async () => {
    const res = await api('/api/auth/admin-only', { token: adminToken });
    expect(res.status).toBe(200);
  });

  it('customer is forbidden from /admin-only', async () => {
    const res = await api('/api/auth/admin-only', { token: customerToken });
    expect(res.status).toBe(403);
  });

  it('unauthenticated user gets 401 from /admin-only', async () => {
    const res = await api('/api/auth/admin-only');
    expect(res.status).toBe(401);
  });
});

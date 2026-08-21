// routes/auth.ts — register, login, refresh, logout, me.
// Public register only allows 'customer' role. Admin creates staff/admin.
// Access token: 15min. Refresh token: 7d with rotation.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { hashPassword, verifyPassword, signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/crypto.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { rateLimitMiddleware } from '../middleware/rateLimit.ts';
import { randomId } from '../lib/id.ts';

const auth = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

// Public registration — only 'customer' role allowed
const publicRegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

// Admin-only registration (for creating staff/admin accounts)
const adminRegisterSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['admin', 'staff']),
  phone: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register — public, customer only
auth.post('/register', zValidator('json', publicRegisterSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof publicRegisterSchema>;

  const existing = await query.get('SELECT id FROM users WHERE email = ?', body.email);
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const userId = randomId();
  const hash = await hashPassword(body.password);

  await query.transaction(async () => {
    await query.run(
      `INSERT INTO users (id, email, name, password, role, phone) VALUES (?, ?, ?, ?, 'customer', ?)`,
      userId,
      body.email,
      body.name,
      hash,
      body.phone ?? null,
    );

    const customerId = randomId();
    await query.run(
      `INSERT INTO customers (id, user_id, name, phone, email, address) VALUES (?, ?, ?, ?, ?, ?)`,
      customerId,
      userId,
      body.name,
      body.phone ?? null,
      body.email,
      body.address ?? null,
    );
  });

  const accessToken = await signAccessToken({ userId, role: 'customer' });
  const refreshTokenId = randomId();
  const refreshToken = await signRefreshToken({ userId, role: 'customer', jti: refreshTokenId });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query.run(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    refreshTokenId, userId, refreshToken, expiresAt,
  );

  return c.json(
    {
      user: { id: userId, email: body.email, name: body.name, role: 'customer' },
      accessToken,
      refreshToken,
    },
    201,
  );
});

// POST /api/auth/admin-register — admin only, for creating staff/admin
auth.post('/admin-register', authenticate, requireRole('admin'), zValidator('json', adminRegisterSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof adminRegisterSchema>;

  const existing = await query.get('SELECT id FROM users WHERE email = ?', body.email);
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const userId = randomId();
  const hash = await hashPassword(body.password);

  await query.run(
    `INSERT INTO users (id, email, name, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`,
    userId, body.email, body.name, hash, body.role, body.phone ?? null,
  );

  const accessToken = await signAccessToken({ userId, role: body.role });
  return c.json(
    { user: { id: userId, email: body.email, name: body.name, role: body.role }, accessToken },
    201,
  );
});

// POST /api/auth/login (rate limited: 5 attempts per 60s per IP)
auth.post('/login', rateLimitMiddleware(), zValidator('json', loginSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof loginSchema>;

  const row = (await query.get(
    'SELECT id, email, name, password, role FROM users WHERE email = ?',
    body.email,
  )) as
    | { id: string; email: string; name: string; password: string; role: string }
    | undefined;

  if (!row || !verifyPassword(body.password, row.password)) {
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  const accessToken = await signAccessToken({ userId: row.id, role: row.role });
  const refreshTokenId = randomId();
  const refreshToken = await signRefreshToken({ userId: row.id, role: row.role, jti: refreshTokenId });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query.run(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    refreshTokenId, row.id, refreshToken, expiresAt,
  );

  return c.json({
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
    accessToken,
    refreshToken,
  });
});

// POST /api/auth/refresh — exchange refresh token for new access token
auth.post('/refresh', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { refreshToken?: string };
  if (!body.refreshToken) return c.json({ error: 'Refresh token required' }, 400);

  const decoded = await verifyRefreshToken(body.refreshToken);
  if (!decoded) return c.json({ error: 'Invalid or expired refresh token' }, 401);

  // Check if refresh token exists in DB (not revoked)
  const stored = await query.get(
    'SELECT id FROM refresh_tokens WHERE id = ? AND user_id = ? AND revoked = 0',
    decoded.jti, decoded.userId,
  );
  if (!stored) return c.json({ error: 'Refresh token revoked' }, 401);

  // Rotate: revoke old, issue new
  await query.run('UPDATE refresh_tokens SET revoked = 1 WHERE id = ?', decoded.jti);

  const newRefreshId = randomId();
  const newAccessToken = await signAccessToken({ userId: decoded.userId, role: decoded.role });
  const newRefreshToken = await signRefreshToken({ userId: decoded.userId, role: decoded.role, jti: newRefreshId });
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await query.run(
    `INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)`,
    newRefreshId, decoded.userId, newRefreshToken, expiresAt,
  );

  return c.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
});

// POST /api/auth/logout — revoke refresh token
auth.post('/logout', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { refreshToken?: string };
  if (body.refreshToken) {
    await query.run('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?', body.refreshToken);
  }
  return c.json({ message: 'Logged out' });
});

// GET /api/auth/me — returns the authenticated user's profile (no password).
auth.get('/me', authenticate, async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'Not authenticated' }, 401);

  const row = (await query.get(
    'SELECT id, email, name, role, phone, created_at FROM users WHERE id = ?',
    user.userId,
  )) as
    | {
        id: string;
        email: string;
        name: string;
        role: string;
        phone: string | null;
        created_at: string;
      }
    | undefined;
  if (!row) return c.json({ error: 'User not found' }, 404);

  return c.json({ user: row });
});

// GET /api/auth/admin-only — proves role guard works.
auth.get('/admin-only', authenticate, requireRole('admin'), (c) => {
  return c.json({ message: 'You are admin.', user: c.get('user') });
});

export default auth;

// routes/auth.ts — register, login, me (authenticated profile).
// Password hashed with bcrypt on register. JWT issued on login.
// Never returns password/hash in any response.
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { query } from '../lib/query.ts';
import { hashPassword, verifyPassword, signToken } from '../lib/crypto.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { rateLimitMiddleware } from '../middleware/rateLimit.ts';
import { randomId } from '../lib/id.ts';

const auth = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1).max(100),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  role: z.enum(['admin', 'staff', 'customer']).default('customer'),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// POST /api/auth/register
auth.post('/register', zValidator('json', registerSchema), async (c) => {
  const body = c.req.valid('json' as never) as z.infer<typeof registerSchema>;

  const existing = await query.get('SELECT id FROM users WHERE email = ?', body.email);
  if (existing) {
    return c.json({ error: 'Email already registered' }, 409);
  }

  const userId = randomId();
  const hash = await hashPassword(body.password);

  await query.transaction(async () => {
    await query.run(
      `INSERT INTO users (id, email, name, password, role, phone) VALUES (?, ?, ?, ?, ?, ?)`,
      userId,
      body.email,
      body.name,
      hash,
      body.role,
      body.phone ?? null,
    );

    if (body.role === 'customer') {
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
    }
  });

  const token = await signToken({ userId, role: body.role });
  return c.json(
    {
      user: { id: userId, email: body.email, name: body.name, role: body.role },
      token,
    },
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

  const token = await signToken({ userId: row.id, role: row.role });
  return c.json({
    user: { id: row.id, email: row.email, name: row.name, role: row.role },
    token,
  });
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

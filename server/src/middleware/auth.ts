// middleware/auth.ts — extracts Bearer token, verifies, sets ctx.user.
// requireRole(...allowed) — authorization gate after authentication.
import type { Context, Next } from 'hono';
import { verifyAccessToken } from '../lib/crypto.ts';

// Augment Hono context with our user type.
type AppContext = {
  Variables: {
    user: { userId: string; role: string } | null;
  };
};

// Authentication: reads Authorization: Bearer <jwt>, sets c.set('user', ...) or null.
export const authenticate = async (c: Context<AppContext>, next: Next) => {
  const header = c.req.header('Authorization') ?? '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (match) {
    const decoded = await verifyAccessToken(match[1] ?? '');
    if (decoded) c.set('user', decoded);
  }
  await next();
};

// Authorization: call requireRole('admin', 'staff') to gate a route.
export const requireRole =
  (...allowed: string[]) =>
  async (c: Context<AppContext>, next: Next) => {
    const user = c.get('user');
    if (!user) {
      return c.json({ error: 'Authentication required' }, 401);
    }
    if (!allowed.includes(user.role)) {
      return c.json({ error: 'Forbidden: insufficient role' }, 403);
    }
    await next();
  };

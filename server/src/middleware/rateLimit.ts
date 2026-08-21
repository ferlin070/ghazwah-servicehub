// middleware/rateLimit.ts — simple in-memory rate limiter for login.
// Limits by IP: max 5 attempts per 60s window. Returns 429 after that.
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(ip: string): { ok: boolean; remaining: number; retryAfter: number } {
  const now = Date.now();
  const entry = attempts.get(ip);

  if (!entry || now > entry.resetAt) {
    attempts.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_ATTEMPTS - 1, retryAfter: 0 };
  }

  entry.count++;
  if (entry.count > MAX_ATTEMPTS) {
    return { ok: false, remaining: 0, retryAfter: Math.ceil((entry.resetAt - now) / 1000) };
  }

  return { ok: true, remaining: MAX_ATTEMPTS - entry.count, retryAfter: 0 };
}

// Hono middleware factory — use on specific routes (e.g. login).
import type { Context, Next } from 'hono';

export function rateLimitMiddleware() {
  return async (c: Context, next: Next) => {
    // Skip rate limiting in test environment
    if (process.env.NODE_ENV === 'test') return next();

    const ip = c.req.header('x-forwarded-for') ?? 'unknown';
    const result = rateLimit(ip);
    c.header('X-RateLimit-Remaining', String(result.remaining));
    if (!result.ok) {
      c.header('Retry-After', String(result.retryAfter));
      return c.json({ error: `Too many attempts. Try again in ${result.retryAfter}s.` }, 429);
    }
    await next();
  };
}

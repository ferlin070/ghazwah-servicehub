// middleware/errorHandler.ts — global error handler for PostgreSQL.
import type { Context } from 'hono';

export function errorHandler(err: Error, c: Context): Response {
  // PostgreSQL FK violation (code 23503)
  if ((err as any).code === '23503') {
    return c.json({ error: 'Cannot delete: this record is referenced by other records.' }, 409);
  }
  // PostgreSQL unique violation (code 23505)
  if ((err as any).code === '23505') {
    return c.json({ error: 'A record with this value already exists.' }, 409);
  }
  // zod validation errors are handled by zValidator (400)
  if (err.name === 'ZodError') {
    return c.json({ error: 'Validation failed', details: JSON.parse(err.message) }, 400);
  }
  console.error('[server] unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
}

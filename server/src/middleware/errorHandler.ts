// middleware/errorHandler.ts — global error handler.
// Catches FK violations (SQLite error code 19) and returns friendly 409.
import type { Context } from 'hono';

export function errorHandler(err: Error, c: Context): Response {
  // sql.js FK constraint errors contain "FOREIGN KEY" in the message
  if (/foreign key|FOREIGN KEY/i.test(err.message)) {
    return c.json({ error: 'Cannot delete: this record is referenced by other records.' }, 409);
  }
  // sql.js UNIQUE constraint
  if (/UNIQUE constraint/i.test(err.message)) {
    return c.json({ error: 'A record with this value already exists.' }, 409);
  }
  // zod validation errors are handled by zValidator (400)
  if (err.name === 'ZodError') {
    return c.json({ error: 'Validation failed', details: JSON.parse(err.message) }, 400);
  }
  console.error('[server] unhandled error:', err);
  return c.json({ error: 'Internal server error' }, 500);
}

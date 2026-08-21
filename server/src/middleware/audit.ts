// middleware/audit.ts — automatic audit logging for write operations.
// Logs to audit_logs table with old/new values.
import type { Context, Next } from 'hono';
import { query } from '../lib/query.ts';
import { randomId } from '../lib/id.ts';

type AuditContext = {
  Variables: {
    user: { userId: string; role: string } | null;
    auditEntity?: string;
    auditEntityId?: string;
  };
};

export function auditLog(entity: string) {
  return async (c: Context<AuditContext>, next: Next) => {
    // Store entity info for post-handler logging
    c.set('auditEntity', entity);
    c.set('auditEntityId', c.req.param('id'));

    // Capture request body for create/update
    const body = c.req.method !== 'GET' ? await c.req.json().catch(() => null) : null;

    await next();

    // Log after response (only for mutations)
    if (c.req.method === 'POST' || c.req.method === 'PUT' || c.req.method === 'DELETE') {
      const user = c.get('user');
      const entityId = c.get('auditEntityId') ?? (body as any)?.id;
      const action = c.req.method === 'POST' ? 'create' : c.req.method === 'PUT' ? 'update' : 'delete';
      const ip = c.req.header('x-forwarded-for') ?? c.req.header('x-real-ip') ?? 'unknown';

      try {
        await query.run(
          `INSERT INTO audit_logs (id, user_id, action, entity, entity_id, new_value, ip_address)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          randomId(),
          user?.userId ?? null,
          action,
          entity,
          entityId ?? null,
          body ? JSON.stringify(body) : null,
          ip,
        );
      } catch {
        // Don't fail requests if audit logging fails
      }
    }
  };
}

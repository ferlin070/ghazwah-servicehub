// routes/uploads.ts — file upload endpoint.
// Stores files locally in data/uploads/. S3-ready: swap storage backend.
import { Hono } from 'hono';
import { query } from '../lib/query.ts';
import { authenticate, requireRole } from '../middleware/auth.ts';
import { randomId } from '../lib/id.ts';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? join(__dirname, '..', '..', '..', 'data', 'uploads');

mkdirSync(UPLOAD_DIR, { recursive: true });

const uploads = new Hono<{
  Variables: { user: { userId: string; role: string } | null };
}>();

uploads.use('*', authenticate);

// POST /api/uploads — upload a file
// Multipart form: file field + entityType + entityId (optional)
uploads.post('/', requireRole('admin', 'staff'), async (c) => {
  const user = c.get('user')!;
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const entityType = (formData.get('entityType') as string) ?? 'general';
  const entityId = (formData.get('entityId') as string) ?? null;

  if (!file) return c.json({ error: 'No file provided' }, 400);

  // Validate file size (max 10MB)
  if (file.size > 10 * 1024 * 1024) {
    return c.json({ error: 'File too large (max 10MB)' }, 400);
  }

  // Validate mime type
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: 'File type not allowed. Allowed: JPEG, PNG, WebP, GIF, PDF' }, 400);
  }

  // Generate unique filename
  const ext = file.name.split('.').pop() ?? 'bin';
  const filename = `${randomId()}.${ext}`;
  const entityDir = join(UPLOAD_DIR, entityType);
  mkdirSync(entityDir, { recursive: true });
  const filePath = join(entityDir, filename);

  // Write file
  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(filePath, buffer);

  // Save metadata to DB
  const id = randomId();
  await query.run(
    `INSERT INTO file_uploads (id, user_id, entity_type, entity_id, filename, original_name, mime_type, size, path)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id, user.userId, entityType, entityId, filename, file.name, file.type, file.size, filePath,
  );

  return c.json({
    file: {
      id,
      filename,
      originalName: file.name,
      mimeType: file.type,
      size: file.size,
      url: `/api/uploads/${entityType}/${filename}`,
    },
  }, 201);
});

// GET /api/uploads/:entityType/:filename — serve uploaded file
uploads.get('/:entityType/:filename', async (c) => {
  const entityType = c.req.param('entityType');
  const filename = c.req.param('filename');

  // Sanitize path components
  if (entityType.includes('..') || filename.includes('..')) {
    return c.json({ error: 'Invalid path' }, 400);
  }

  const filePath = join(UPLOAD_DIR, entityType, filename);
  if (!existsSync(filePath)) {
    return c.json({ error: 'File not found' }, 404);
  }

  const { readFileSync } = await import('node:fs');
  const buffer = readFileSync(filePath);
  const ext = filename.split('.').pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf',
  };
  const contentType = mimeMap[ext ?? ''] ?? 'application/octet-stream';

  return new Response(buffer, {
    headers: { 'Content-Type': contentType, 'Cache-Control': 'public, max-age=31536000' },
  });
});

// GET /api/uploads/:entityType — list files for an entity
uploads.get('/:entityType', async (c) => {
  const entityType = c.req.param('entityType');
  const entityId = c.req.query('entityId');

  let rows;
  if (entityId) {
    rows = await query.all(
      'SELECT * FROM file_uploads WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      entityType, entityId,
    );
  } else {
    rows = await query.all(
      'SELECT * FROM file_uploads WHERE entity_type = ? ORDER BY created_at DESC',
      entityType,
    );
  }
  return c.json({ files: rows });
});

export default uploads;

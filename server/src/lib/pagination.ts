// lib/pagination.ts — pagination helper for list endpoints.
// Usage: const { page, limit, offset, meta } = parsePagination(c.req);
// Query: ?page=2&limit=20
export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function parsePagination(req: { query: (key: string) => string | undefined }): {
  page: number;
  limit: number;
  offset: number;
} {
  const page = Math.max(1, parseInt(req.query('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query('limit') ?? '20', 10) || 20));
  return { page, limit, offset: (page - 1) * limit };
}

export function makeMeta(page: number, limit: number, total: number): PageMeta {
  return { page, limit, total, totalPages: Math.ceil(total / limit) };
}

// lib/query.ts — PostgreSQL query helpers using node-postgres pool.
// Auto-converts ? placeholders to $1, $2, ... for PostgreSQL compatibility.
import { pool } from '../db/db.ts';

function convertPlaceholders(sql: string, params: unknown[]): { text: string; values: unknown[] } {
  let idx = 0;
  const text = sql.replace(/\?/g, () => `$${++idx}`);
  return { text, values: params };
}

export const query = {
  async get(sql: string, ...params: unknown[]): Promise<Record<string, unknown> | undefined> {
    const { text, values } = convertPlaceholders(sql, params);
    const result = await pool.query(text, values);
    return result.rows[0] as Record<string, unknown> | undefined;
  },

  async all(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
    const { text, values } = convertPlaceholders(sql, params);
    const result = await pool.query(text, values);
    return result.rows as Record<string, unknown>[];
  },

  async run(sql: string, ...params: unknown[]): Promise<void> {
    const { text, values } = convertPlaceholders(sql, params);
    await pool.query(text, values);
  },

  async exec(sql: string): Promise<void> {
    await pool.query(sql);
  },

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await fn();
      await client.query('COMMIT');
      return result;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },
};

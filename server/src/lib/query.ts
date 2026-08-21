// lib/query.ts — thin wrapper over sql.js that mimics better-sqlite3 API.
import { getDb, saveDb } from '../db/db.ts';
import type { SqlValue } from 'sql.js';

let inTransaction = false;

export const query = {
  async get(sql: string, ...params: unknown[]): Promise<Record<string, unknown> | undefined> {
    const db = await getDb();
    const stmt = db.prepare(sql);
    try {
      if (params.length) stmt.bind(params as (string | number | null)[]);
      if (stmt.step()) {
        return stmt.getAsObject() as Record<string, unknown>;
      }
      return undefined;
    } finally {
      stmt.free();
    }
  },

  async all(sql: string, ...params: unknown[]): Promise<Record<string, unknown>[]> {
    const db = await getDb();
    const stmt = db.prepare(sql);
    try {
      if (params.length) stmt.bind(params as (string | number | null)[]);
      const rows: Record<string, unknown>[] = [];
      while (stmt.step()) {
        rows.push(stmt.getAsObject() as Record<string, unknown>);
      }
      return rows;
    } finally {
      stmt.free();
    }
  },

  async run(sql: string, ...params: unknown[]): Promise<void> {
    const db = await getDb();
    // db.run() is sql.js shorthand: prepare + bind + step + free.
    db.run(sql, (params.length ? params : []) as SqlValue[]);
  },

  async exec(sql: string): Promise<void> {
    const db = await getDb();
    db.exec(sql);
    saveDb();
  },

  async transaction<T>(fn: () => T | Promise<T>): Promise<T> {
    const db = await getDb();
    if (inTransaction) {
      return await fn();
    }
    inTransaction = true;
    db.exec('BEGIN');
    try {
      const result = await fn();
      db.exec('COMMIT');
      saveDb();
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    } finally {
      inTransaction = false;
    }
  },
};

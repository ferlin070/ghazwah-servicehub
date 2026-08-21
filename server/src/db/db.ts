// db.ts — sql.js (WASM SQLite) connection with file persistence.
// No native build needed. DB file at data/app.db. Auto-saves via saveDb().
import initSqlJs, { type Database } from 'sql.js';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DB_PATH
  ? dirname(process.env.DB_PATH)
  : join(__dirname, '..', '..', 'data');
const DB_FILE = process.env.DB_PATH ?? join(DATA_DIR, 'app.db');

mkdirSync(DATA_DIR, { recursive: true });

let _db: Database | null = null;

export async function getDb(): Promise<Database> {
  if (_db) return _db;
  const SQL = await initSqlJs();
  if (existsSync(DB_FILE)) {
    const buf = readFileSync(DB_FILE);
    _db = new SQL.Database(new Uint8Array(buf));
  } else {
    _db = new SQL.Database();
  }
  _db.exec('PRAGMA foreign_keys = ON;');
  return _db;
}

export function saveDb(): void {
  if (!_db) return;
  const data = _db.export();
  writeFileSync(DB_FILE, Buffer.from(data));
}

export function closeDb(): void {
  if (_db) {
    saveDb();
    _db.close();
    _db = null;
  }
}

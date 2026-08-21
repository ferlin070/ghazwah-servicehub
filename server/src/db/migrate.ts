// migrate.ts — runs all .sql files in server/migrations/ in order.
// Idempotent: CREATE TABLE IF NOT EXISTS. Safe to re-run.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb, saveDb, closeDb } from './db.ts';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations');

async function main() {
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  if (files.length === 0) {
    console.log('  [migrate] No migrations found.');
    return;
  }

  console.log(`  [migrate] ${files.length} migration(s) found.`);
  const db = await getDb();

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    try {
      db.exec(sql);
      console.log(`  [migrate] ✅ applied ${f}`);
    } catch (err) {
      console.error(`  [migrate] ❌ failed on ${f}:`, (err as Error).message);
      closeDb();
      process.exit(1);
    }
  }

  saveDb();
  console.log('  [migrate] ✅ all migrations applied + saved to disk.');
  closeDb();
}

main();

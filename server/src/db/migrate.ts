// migrate.ts — runs all .sql files in server/migrations/ in order against PostgreSQL.
// Requires DATABASE_URL env var.
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './db.ts';

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

  for (const f of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, f), 'utf8');
    try {
      await pool.query(sql);
      console.log(`  [migrate] ✅ applied ${f}`);
    } catch (err) {
      console.error(`  [migrate] ❌ failed on ${f}:`, (err as Error).message);
      await pool.end();
      process.exit(1);
    }
  }

  await pool.end();
  console.log('  [migrate] ✅ all migrations applied.');
}

main();

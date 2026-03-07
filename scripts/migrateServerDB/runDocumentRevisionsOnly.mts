/**
 * Создаёт только таблицу document_revisions (если полная миграция 0092 падает из-за существующих таблиц).
 * Загрузка env как в index.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { Pool } from 'pg';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sqlPath = join(process.cwd(), 'packages/database/migrations/0092_document_revisions_only.sql');
const fullSql = readFileSync(sqlPath, 'utf8');
const statements = fullSql
  .split(';')
  .map((s) => s.replace(/--[^\n]*/g, '').trim())
  .filter((s) => s.length > 0);

async function run() {
  const pool = new Pool({ connectionString });
  try {
    for (const statement of statements) {
      await pool.query(statement + ';');
    }
    console.log('✅ document_revisions table created (or already exists)');
  } catch (err: any) {
    console.error('❌ Failed:', err?.message || err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();

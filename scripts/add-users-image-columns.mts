/**
 * Добавляет колонки daily_image_count и last_image_date в таблицу users.
 * Использует тот же DATABASE_URL, что и приложение (.env.local).
 * Запуск: npx tsx scripts/add-users-image-columns.mts
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { sql } from 'drizzle-orm';

const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL не задан. Проверь .env.local');
    process.exit(1);
  }

  const { serverDB } = await import('../packages/database/src/server');

  console.log('Добавляю колонки в users...');
  await serverDB.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_image_count" integer NOT NULL DEFAULT 0`,
  );
  await serverDB.execute(
    sql`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_image_date" timestamp with time zone`,
  );
  console.log('✅ Колонки daily_image_count и last_image_date добавлены.');
  process.exit(0);
}

main().catch((err) => {
  console.error('❌ Ошибка:', err);
  process.exit(1);
});

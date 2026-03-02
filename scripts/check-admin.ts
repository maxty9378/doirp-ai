/**
 * Проверка пользователей в БД (в т.ч. админ).
 * Запуск: npx tsx scripts/check-admin.ts
 */
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ path: '.env.local' }));

const DATABASE_URL = process.env.DATABASE_URL;
const ADMIN_EMAIL = process.env.NEXT_PUBLIC_ADMIN_EMAIL;

async function check() {
  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL не задан');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const isCloud = DATABASE_URL.includes('twc1.net') || DATABASE_URL.includes('twc.tech');
  const client = new pg.Client({
    connectionString: DATABASE_URL,
    ssl: isCloud ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log('🔌 Подключение к БД: OK\n');

    const usersRes = await client.query(
      `SELECT id, email, normalized_email, username, full_name, role, email_verified, created_at
       FROM users
       ORDER BY created_at DESC
       LIMIT 20`,
    );

    console.log('Пользователи в БД (последние 20):');
    console.log('─'.repeat(80));
    if (usersRes.rows.length === 0) {
      console.log('  (пусто)');
    } else {
      for (const row of usersRes.rows) {
        const isAdminEmail = ADMIN_EMAIL && row.email === ADMIN_EMAIL;
        const mark = row.role === 'admin' || isAdminEmail ? ' [ADMIN]' : '';
        console.log(
          `  ${row.email ?? '(нет email)'}  |  username: ${row.username ?? '—'}  |  role: ${row.role ?? '—'}${mark}`,
        );
      }
    }
    console.log('─'.repeat(80));
    console.log(`NEXT_PUBLIC_ADMIN_EMAIL в .env: ${ADMIN_EMAIL ?? '(не задан)'}`);
    console.log('\n✅ Готово.');
  } catch (err) {
    console.error('❌ Ошибка:', (err as Error).message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

check();

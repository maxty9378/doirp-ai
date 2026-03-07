/**
 * Сброс состояния онбординга для пользователя по email или для всех пользователей.
 * После сброса при следующем входе пользователя перенаправит на /onboarding.
 *
 * Запуск для одного пользователя:
 *   pnpm run reset:onboarding -- maxim.kadochkin@gmail.com
 *   RESET_ONBOARDING_EMAIL=maxim.kadochkin@gmail.com pnpm run reset:onboarding
 *
 * Сброс для всех пользователей:
 *   pnpm run reset:onboarding -- --all
 */

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ path: '.env.local' }));

const arg = process.argv[2]?.trim() || process.env.RESET_ONBOARDING_EMAIL?.trim();
const isAll = arg === '--all' || arg === 'all';
const email = isAll ? undefined : arg;

async function resetOnboarding(): Promise<void> {
  if (!email && !isAll) {
    console.error(
      'Укажите email или --all: pnpm run reset:onboarding -- user@example.com | pnpm run reset:onboarding -- --all',
    );
    process.exit(1);
  }

  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('DATABASE_URL не задан');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();

    if (isAll) {
      const result = await client.query(
        'UPDATE users SET onboarding = NULL, updated_at = NOW()',
      );
      const total = result.rowCount ?? 0;
      console.log('Онбординг сброшен для всех пользователей. Обновлено записей:', total);
      console.log('При следующем входе откроется /onboarding.');
      return;
    }

    const find = await client.query(
      'SELECT id, email, onboarding FROM users WHERE email = $1 OR normalized_email = $2',
      [email, email!.toLowerCase()],
    );

    if (!find.rows.length) {
      console.error('Пользователь не найден:', email);
      process.exit(1);
    }

    const user = find.rows[0];
    await client.query(
      'UPDATE users SET onboarding = NULL, updated_at = NOW() WHERE id = $1',
      [user.id],
    );

    console.log('Онбординг сброшен для:', user.email, '(id:', user.id, ')');
    console.log('При следующем входе откроется /onboarding.');
  } catch (err) {
    console.error('Ошибка:', err);
    process.exit(1);
  } finally {
    await client.end();
  }
}

resetOnboarding();

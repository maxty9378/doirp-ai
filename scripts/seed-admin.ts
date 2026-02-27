/**
 * Seed an admin user with simple login and password.
 * Run: pnpm run seed:admin (loads .env / .env.local)
 * Or: DATABASE_URL=postgresql://... pnpm run seed:admin
 *
 * Creates user:
 *   Email: admin@local.host
 *   Username: admin
 *   Password: 9378
 *
 * Set NEXT_PUBLIC_ADMIN_EMAIL=admin@local.host or keep default in src/const/admin.ts to use as admin.
 */

import bcrypt from 'bcryptjs';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// Load .env files but do NOT override explicit DATABASE_URL passed from environment
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ path: '.env.local' }));

const ADMIN_SEED = {
  email: 'admin@local.host',
  fullName: 'Admin',
  id: 'user_seed_admin_001',
  password: '9378',
  username: 'admin',
};

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

async function seedAdmin(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set');
    process.exit(1);
  }

  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: databaseUrl });

  try {
    await client.connect();
    console.log('🔌 Connected to database');

    const now = new Date().toISOString();
    const accountId = 'seed_admin_account_001';
    const passwordHash = await hashPassword(ADMIN_SEED.password);
    const onboarding = JSON.stringify({ finishedAt: now, version: 1 });

    await client.query(
      `INSERT INTO users (id, email, normalized_email, username, full_name, email_verified, onboarding, created_at, updated_at, last_active_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $8)
       ON CONFLICT (id) DO UPDATE SET
         email = EXCLUDED.email,
         normalized_email = EXCLUDED.normalized_email,
         username = EXCLUDED.username,
         full_name = EXCLUDED.full_name,
         updated_at = EXCLUDED.updated_at`,
      [
        ADMIN_SEED.id,
        ADMIN_SEED.email,
        ADMIN_SEED.email.toLowerCase(),
        ADMIN_SEED.username,
        ADMIN_SEED.fullName,
        true,
        onboarding,
        now,
      ],
    );

    const userRow = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [ADMIN_SEED.email],
    );
    const userId = userRow.rows[0]?.id ?? ADMIN_SEED.id;

    const existingAccount = await client.query(
      'SELECT id FROM accounts WHERE user_id = $1 AND provider_id = $2',
      [userId, 'credential'],
    );
    if (existingAccount.rows[0]) {
      await client.query(
        'UPDATE accounts SET password = $1, updated_at = $2 WHERE id = $3',
        [passwordHash, now, existingAccount.rows[0].id],
      );
    } else {
      await client.query(
        `INSERT INTO accounts (id, user_id, account_id, provider_id, password, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)`,
        [
          accountId,
          userId,
          ADMIN_SEED.email,
          'credential',
          passwordHash,
          now,
        ],
      );
    }

    // Add to user_codes so admin appears on /settings/users and has token quota
    const userCodeId = 'seed_admin_code_001';
    const adminCode = 'admin9378'; // unique code for seeded admin
    await client.query(
      `INSERT INTO user_codes (id, user_id, email, code, token_quota, tokens_used, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 100000, 0, $5, $5)
       ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, code = EXCLUDED.code, updated_at = EXCLUDED.updated_at`,
      [userCodeId, userId, ADMIN_SEED.email, adminCode, now],
    );

    console.log('✅ Admin user seeded');
    console.log('   Login (email):', ADMIN_SEED.email);
    console.log('   Username:', ADMIN_SEED.username);
    console.log('   Password:', ADMIN_SEED.password);
    console.log('   Set NEXT_PUBLIC_ADMIN_EMAIL=admin@local.host to use as admin (or already set in code).');
  } catch (error) {
    console.error('❌ Failed to seed admin:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

seedAdmin();

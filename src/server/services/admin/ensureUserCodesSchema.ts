import { sql } from 'drizzle-orm';

import { DEFAULT_USER_TOKEN_QUOTA } from '@/database/schemas';
import { serverDB } from '@/database/server';

/**
 * Makes admin user management endpoints resilient to partially applied DB migrations.
 * This only creates/extends user_codes if it is missing.
 */
export const ensureUserCodesSchema = async () => {
  const defaultTokenQuota = sql.raw(String(DEFAULT_USER_TOKEN_QUOTA));

  await serverDB.execute(sql`
    CREATE TABLE IF NOT EXISTS "user_codes" (
      "id" text PRIMARY KEY NOT NULL,
      "user_id" text NOT NULL,
      "email" text NOT NULL,
      "code" text NOT NULL,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "token_quota" integer NOT NULL DEFAULT ${defaultTokenQuota};
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "tokens_used" integer NOT NULL DEFAULT 0;
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "plain_password" text;
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "account_type" text NOT NULL DEFAULT 'standard';
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "training_session_quota" integer;
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "training_sessions_used" integer NOT NULL DEFAULT 0;
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "daily_image_count" integer NOT NULL DEFAULT 0;
  `);

  await serverDB.execute(sql`
    ALTER TABLE "user_codes"
      ADD COLUMN IF NOT EXISTS "last_image_date" timestamp with time zone;
  `);

  await serverDB.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_codes_code_unique" ON "user_codes" ("code");
  `);

  await serverDB.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_codes_code_idx" ON "user_codes" ("code");
  `);

  await serverDB.execute(sql`
    CREATE INDEX IF NOT EXISTS "user_codes_user_id_idx" ON "user_codes" ("user_id");
  `);
};

ALTER TABLE "user_codes" ADD COLUMN IF NOT EXISTS "token_quota" integer NOT NULL DEFAULT 100000;--> statement-breakpoint
ALTER TABLE "user_codes" ADD COLUMN IF NOT EXISTS "tokens_used" integer NOT NULL DEFAULT 0;

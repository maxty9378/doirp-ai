CREATE TABLE IF NOT EXISTS "user_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"code" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'user_codes_user_id_users_id_fk'
  ) THEN
    ALTER TABLE "user_codes"
      ADD CONSTRAINT "user_codes_user_id_users_id_fk"
      FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "user_codes_code_unique" ON "user_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_codes_code_idx" ON "user_codes" USING btree ("code");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_codes_user_id_idx" ON "user_codes" USING btree ("user_id");

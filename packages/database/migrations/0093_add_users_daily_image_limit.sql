ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_image_count" integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_image_date" timestamp with time zone;

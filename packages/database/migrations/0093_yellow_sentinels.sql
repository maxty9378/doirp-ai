CREATE TABLE "training_knowledge_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"scenario_id" text NOT NULL,
	"product_ingredient" text NOT NULL,
	"official_usp" text NOT NULL,
	"attack_myth" text NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_scenarios" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"legend" text,
	"user_role" text,
	"goals" jsonb DEFAULT '[]'::jsonb,
	"system_prompt" text,
	"assistant_label" text,
	"user_label" text,
	"voice_name" text,
	"banner_url" text,
	"context_window" integer,
	"silence_nudge_after_ms" integer,
	"silence_nudge_cooldown_ms" integer,
	"silence_hard_hangup_ms" integer,
	"silence_nudge_phrases" jsonb DEFAULT '[]'::jsonb,
	"show_legend" boolean DEFAULT true,
	"enable_checkpoints" boolean DEFAULT false,
	"enable_scoring" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "daily_image_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "last_image_date" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "training_knowledge_entries" ADD CONSTRAINT "training_knowledge_entries_scenario_id_training_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."training_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "training_knowledge_entries_scenario_id_idx" ON "training_knowledge_entries" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "training_knowledge_entries_product_idx" ON "training_knowledge_entries" USING btree ("product_ingredient");--> statement-breakpoint
CREATE UNIQUE INDEX "training_scenarios_key_unique" ON "training_scenarios" USING btree ("key");--> statement-breakpoint
CREATE INDEX "training_scenarios_active_idx" ON "training_scenarios" USING btree ("is_active");
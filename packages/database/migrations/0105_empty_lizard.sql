CREATE TABLE "voice_call_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scenario_id" text NOT NULL,
	"speaker_name" text,
	"transcript" jsonb NOT NULL,
	"analysis_result" jsonb,
	"score" integer,
	"hang_up_reason" text,
	"duration_seconds" integer,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "voice_call_proxies" (
	"id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"enabled" integer DEFAULT 1 NOT NULL,
	"priority" integer DEFAULT 1000 NOT NULL,
	"last_check_at" timestamp with time zone,
	"last_check_ok" integer,
	"last_check_error" text,
	"last_check_latency_ms" integer,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "checkpoint_ids" jsonb DEFAULT '[]'::jsonb;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "analyze_prompt" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "debrief_prompt" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "session_duration_ms" integer;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "show_intro_dialog" boolean DEFAULT true;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "score_display_label" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "score_level_labels" jsonb;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "opening_instruction" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "intro_dialog_title" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "intro_dialog_description" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "intro_dialog_placeholder" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "intro_dialog_hint" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "intro_dialog_button_label" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "round_ending_prompt" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "silence_nudge_template" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "short_answer_nudge" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "quiet_speaker_nudge" text;--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN "auto_success_prompt" text;--> statement-breakpoint
ALTER TABLE "user_codes" ADD COLUMN "account_type" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_codes" ADD COLUMN "training_session_quota" integer;--> statement-breakpoint
ALTER TABLE "user_codes" ADD COLUMN "training_sessions_used" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "voice_call_sessions" ADD CONSTRAINT "voice_call_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "voice_call_sessions_user_id_idx" ON "voice_call_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "voice_call_sessions_scenario_id_idx" ON "voice_call_sessions" USING btree ("scenario_id");--> statement-breakpoint
CREATE INDEX "voice_call_sessions_created_at_idx" ON "voice_call_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "voice_call_proxies_priority_idx" ON "voice_call_proxies" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "voice_call_proxies_enabled_idx" ON "voice_call_proxies" USING btree ("enabled");
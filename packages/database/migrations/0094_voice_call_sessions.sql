CREATE TABLE "voice_call_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"scenario_id" text NOT NULL,
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
ALTER TABLE "voice_call_sessions" ADD CONSTRAINT "voice_call_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "voice_call_sessions_user_id_idx" ON "voice_call_sessions" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX "voice_call_sessions_scenario_id_idx" ON "voice_call_sessions" USING btree ("scenario_id");
--> statement-breakpoint
CREATE INDEX "voice_call_sessions_created_at_idx" ON "voice_call_sessions" USING btree ("created_at");

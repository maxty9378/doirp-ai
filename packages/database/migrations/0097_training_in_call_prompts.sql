ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "round_ending_prompt" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "silence_nudge_template" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "short_answer_nudge" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "quiet_speaker_nudge" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "auto_success_prompt" text;

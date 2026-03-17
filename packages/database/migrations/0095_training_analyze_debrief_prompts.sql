ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "analyze_prompt" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "debrief_prompt" text;

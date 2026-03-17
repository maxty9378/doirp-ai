ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "score_display_label" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "score_level_labels" jsonb;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "opening_instruction" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "intro_dialog_title" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "intro_dialog_description" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "intro_dialog_placeholder" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "intro_dialog_hint" text;
--> statement-breakpoint
ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "intro_dialog_button_label" text;

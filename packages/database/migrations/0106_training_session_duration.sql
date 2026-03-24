ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "session_duration_ms" integer;

-- Seed existing rows: copy from silence_hard_hangup_ms where available
UPDATE "training_scenarios"
SET "session_duration_ms" = "silence_hard_hangup_ms"
WHERE "session_duration_ms" IS NULL AND "silence_hard_hangup_ms" IS NOT NULL;

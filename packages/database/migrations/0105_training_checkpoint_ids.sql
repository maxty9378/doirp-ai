ALTER TABLE "training_scenarios" ADD COLUMN IF NOT EXISTS "checkpoint_ids" jsonb DEFAULT '[]'::jsonb;

UPDATE "training_scenarios"
SET "checkpoint_ids" = '["STRESS_CONTROL", "FACT_CHECK", "REPUTATION_SAVE"]'::jsonb
WHERE "key" = 'training-gfd-stress'
  AND ("checkpoint_ids" IS NULL OR "checkpoint_ids" = '[]'::jsonb);

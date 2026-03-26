ALTER TABLE "voice_call_sessions"
ADD COLUMN IF NOT EXISTS "debug_log" jsonb;


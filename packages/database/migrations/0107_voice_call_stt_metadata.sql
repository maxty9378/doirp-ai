ALTER TABLE "voice_call_sessions" ADD COLUMN IF NOT EXISTS "transcript_source" text;
ALTER TABLE "voice_call_sessions" ADD COLUMN IF NOT EXISTS "stt_status" text;
ALTER TABLE "voice_call_sessions" ADD COLUMN IF NOT EXISTS "stt_error" text;

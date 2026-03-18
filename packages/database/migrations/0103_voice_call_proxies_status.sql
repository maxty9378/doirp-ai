ALTER TABLE voice_call_proxies
  ADD COLUMN IF NOT EXISTS last_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_check_ok integer,
  ADD COLUMN IF NOT EXISTS last_check_error text,
  ADD COLUMN IF NOT EXISTS last_check_latency_ms integer;


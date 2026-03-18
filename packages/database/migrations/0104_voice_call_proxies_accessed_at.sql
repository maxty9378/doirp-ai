ALTER TABLE voice_call_proxies
  ADD COLUMN IF NOT EXISTS accessed_at timestamptz DEFAULT now() NOT NULL;


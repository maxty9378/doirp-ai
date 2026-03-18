-- Таблица прокси для WebSocket-прокси голосового тренажёра
CREATE TABLE IF NOT EXISTS "voice_call_proxies" (
  "id" text PRIMARY KEY NOT NULL,
  "url" text NOT NULL,
  "enabled" integer DEFAULT 1 NOT NULL,
  "priority" integer DEFAULT 1000 NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "voice_call_proxies_priority_idx" ON "voice_call_proxies" ("priority");
CREATE INDEX IF NOT EXISTS "voice_call_proxies_enabled_idx" ON "voice_call_proxies" ("enabled");


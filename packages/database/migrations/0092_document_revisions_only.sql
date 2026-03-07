-- Только таблица document_revisions (если 0092_pink_scorpion.sql падает из-за существующих таблиц)
-- Выполнить вручную: psql $DATABASE_URL -f packages/database/migrations/0092_document_revisions_only.sql
CREATE TABLE IF NOT EXISTS "document_revisions" (
  "id" varchar(255) PRIMARY KEY NOT NULL,
  "document_id" varchar(255) NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "content" text,
  "editor_data" jsonb,
  "metadata" jsonb,
  "user_id" text NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "document_revisions_document_id_idx" ON "document_revisions" ("document_id");
CREATE INDEX IF NOT EXISTS "document_revisions_user_id_idx" ON "document_revisions" ("user_id");

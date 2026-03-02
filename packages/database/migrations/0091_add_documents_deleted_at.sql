-- Soft delete (archive) for documents: show in archive, purge after 24h if not restored
ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "deleted_at" timestamp with time zone;
CREATE INDEX IF NOT EXISTS "documents_deleted_at_idx" ON "documents" ("deleted_at");

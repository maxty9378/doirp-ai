-- Custom SQL migration file, put you code below! --
-- Extension "vector" may require superuser; skip if permission denied (e.g. on managed Postgres).
DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION
  WHEN insufficient_privilege THEN NULL;
  WHEN OTHERS THEN RAISE;
END $$;

import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

function buildDatabaseUrlFromPostgresqlEnv(): string | undefined {
  const host = process.env.POSTGRESQL_HOST;
  const port = process.env.POSTGRESQL_PORT;
  const user = process.env.POSTGRESQL_USER;
  const password = process.env.POSTGRESQL_PASSWORD;
  const dbname = process.env.POSTGRESQL_DBNAME;
  if (!host || !port || !user || password === undefined || !dbname) return undefined;
  const encodedPassword = encodeURIComponent(password);
  return `postgresql://${user}:${encodedPassword}@${host}:${port}/${dbname}`;
}

export const getServerDBConfig = () => {
  return createEnv({
    runtimeEnv: {
      DATABASE_DRIVER: process.env.DATABASE_DRIVER || 'neon',
      DATABASE_TEST_URL: process.env.DATABASE_TEST_URL,
      DATABASE_URL:
        process.env.DATABASE_URL || buildDatabaseUrlFromPostgresqlEnv(),
      DATABASE_SSL_CA: process.env.DATABASE_SSL_CA,
      DATABASE_SSL_REJECT_UNAUTHORIZED: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED,

      KEY_VAULTS_SECRET: process.env.KEY_VAULTS_SECRET,

      REMOVE_GLOBAL_FILE: process.env.DISABLE_REMOVE_GLOBAL_FILE !== '0',
    },
    server: {
      DATABASE_DRIVER: z.enum(['neon', 'node']),
      DATABASE_TEST_URL: z.string().optional(),
      DATABASE_URL: z.string().optional(),
      DATABASE_SSL_CA: z.string().optional(),
      DATABASE_SSL_REJECT_UNAUTHORIZED: z
        .string()
        .optional()
        .transform((v) => v !== '0' && v !== 'false'),

      KEY_VAULTS_SECRET: z.string().optional(),

      REMOVE_GLOBAL_FILE: z.boolean().optional(),
    },
  });
};

export const serverDBEnv = getServerDBConfig();

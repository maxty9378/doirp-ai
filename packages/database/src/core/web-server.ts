import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { Pool as NodePool } from 'pg';
import ws from 'ws';

import { getServerDBConfig } from '@/config/db';

import * as schema from '../schemas';
import type { LobeChatDatabase } from '../type';

function resolveSslCaPath(path: string): string {
  let p = path;
  const home = homedir();
  if (p.startsWith('~')) p = p.replace(/^~($|[\\/])/, `${home}$1`);
  p = p.replaceAll(/%USERPROFILE%/gi, process.env.USERPROFILE || home);
  p = p.replaceAll(/\$HOME/gi, home);
  return resolve(p);
}

export const getDBInstance = (): LobeChatDatabase => {
  // In test environment, return a mock instance to avoid initialization errors
  if (process.env.NODE_ENV === 'test') return {} as LobeChatDatabase;

  // Read config at call time so env is correct (e.g. in Next.js API routes after .env.local is loaded)
  const env = getServerDBConfig();

  if (!env.KEY_VAULTS_SECRET) {
    throw new Error(
      ` \`KEY_VAULTS_SECRET\` is not set, please set it in your environment variables.

If you don't have it, please run \`openssl rand -base64 32\` to create one.
`,
    );
  }

  const connectionString = env.DATABASE_URL;

  if (!connectionString) {
    throw new Error(`You are try to use database, but "DATABASE_URL" is not set correctly`);
  }

  const driver = process.env.DATABASE_DRIVER || env.DATABASE_DRIVER;
  const isLocalhost =
    connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
  const isTimeweb = connectionString.includes('twc1.net') || connectionString.includes('twc.tech');

  if (driver === 'node') {
    let ssl: { ca?: Buffer; rejectUnauthorized: boolean } | boolean | undefined;
    const rejectUnauthorizedDisabled =
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === '0' ||
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false' ||
      env.DATABASE_SSL_REJECT_UNAUTHORIZED === false;

    if (env.DATABASE_SSL_CA) {
      const caPath = resolveSslCaPath(env.DATABASE_SSL_CA);
      ssl = { ca: readFileSync(caPath), rejectUnauthorized: true };
    } else if (rejectUnauthorizedDisabled || (isTimeweb && !isLocalhost)) {
      ssl = { rejectUnauthorized: false };
    } else if (!isLocalhost) {
      ssl = true;
    }

    // Prevent exhausting managed Postgres limits in dev (many worker processes),
    // which can cause random ECONNRESET/timeout errors in tRPC queries.
    const poolMaxFromEnv = Number.parseInt(process.env.DATABASE_POOL_MAX || '', 10);
    const isDev = process.env.NODE_ENV !== 'production';
    const poolMaxDefault = isTimeweb ? (isDev ? 1 : 2) : 10;
    const poolMax =
      Number.isFinite(poolMaxFromEnv) && poolMaxFromEnv > 0 ? poolMaxFromEnv : poolMaxDefault;

    const client = new NodePool({
      allowExitOnIdle: process.env.NODE_ENV !== 'production',
      connectionString,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 15_000,
      keepAlive: true,
      keepAliveInitialDelayMillis: 0,
      max: poolMax,
      ssl,
    });
    return nodeDrizzle(client, { schema });
  }

  if (process.env.MIGRATION_DB === '1') {
    // https://github.com/neondatabase/serverless/blob/main/CONFIG.md#websocketconstructor-typeof-websocket--undefined
    neonConfig.webSocketConstructor = ws;
  }

  const client = new NeonPool({ connectionString });
  return neonDrizzle(client, { schema });
};

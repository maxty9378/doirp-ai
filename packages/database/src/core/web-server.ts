import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { neonConfig, Pool as NeonPool } from '@neondatabase/serverless';
import { drizzle as neonDrizzle } from 'drizzle-orm/neon-serverless';
import { drizzle as nodeDrizzle } from 'drizzle-orm/node-postgres';
import { Pool as NodePool } from 'pg';
import ws from 'ws';

import { serverDBEnv } from '@/config/db';

import * as schema from '../schemas';
import type { LobeChatDatabase } from '../type';

function resolveSslCaPath(path: string): string {
  let p = path;
  const home = homedir();
  if (p.startsWith('~')) p = p.replace(/^~($|[\\/])/, `${home}$1`);
  p = p.replace(/%USERPROFILE%/gi, process.env.USERPROFILE || home);
  p = p.replace(/\$HOME/gi, home);
  return resolve(p);
}

export const getDBInstance = (): LobeChatDatabase => {
  // In test environment, return a mock instance to avoid initialization errors
  if (process.env.NODE_ENV === 'test') return {} as LobeChatDatabase;

  if (!serverDBEnv.KEY_VAULTS_SECRET) {
    throw new Error(
      ` \`KEY_VAULTS_SECRET\` is not set, please set it in your environment variables.

If you don't have it, please run \`openssl rand -base64 32\` to create one.
`,
    );
  }

  const connectionString = serverDBEnv.DATABASE_URL;

  if (!connectionString) {
    throw new Error(`You are try to use database, but "DATABASE_URL" is not set correctly`);
  }

  if (serverDBEnv.DATABASE_DRIVER === 'node') {
    let ssl: { ca?: Buffer; rejectUnauthorized: boolean } | boolean | undefined;
    const rejectUnauthorizedDisabled =
      serverDBEnv.DATABASE_SSL_REJECT_UNAUTHORIZED === false ||
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === '0' ||
      process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false';
    const isLocalhost = connectionString.includes('localhost') || connectionString.includes('127.0.0.1');
    
    if (serverDBEnv.DATABASE_SSL_CA) {
      const caPath = resolveSslCaPath(serverDBEnv.DATABASE_SSL_CA);
      ssl = { ca: readFileSync(caPath), rejectUnauthorized: true };
    } else if (rejectUnauthorizedDisabled) {
      ssl = { rejectUnauthorized: false };
    } else if (!isLocalhost) {
      ssl = true;
    }
    const client = new NodePool({
      connectionString,
      connectionTimeoutMillis: 30_000,
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

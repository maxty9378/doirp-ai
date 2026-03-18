import { join } from 'node:path';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// Load env exactly like migrateServerDB does (so DATABASE_URL/KEY_VAULTS_SECRET are available)
const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config()); // .env
dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' })); // .env.local
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` })); // .env.[env]
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` })); // .env.[env].local

const parseLines = (raw: string) =>
  raw
    .split(/\r?\n/g)
    .map((s) => s.trim())
    .filter(Boolean);

const toHttpProxyUrl = (line: string) => {
  // Accept HOST:PORT:USER:PASS and convert to http://USER:PASS@HOST:PORT
  const m = line.match(/^([^:\s]+):(\d{2,5}):([^:\s]+):([^:\s]+)$/);
  if (!m) throw new Error(`Неверный формат строки: ${line}`);
  const [, host, port, user, pass] = m;
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
};

const INPUT = `
31.59.20.176:6754:xlvhmzvz:fdtx2d20nj7f
23.95.150.145:6114:xlvhmzvz:fdtx2d20nj7f
198.23.239.134:6540:xlvhmzvz:fdtx2d20nj7f
45.38.107.97:6014:xlvhmzvz:fdtx2d20nj7f
107.172.163.27:6543:xlvhmzvz:fdtx2d20nj7f
198.105.121.200:6462:xlvhmzvz:fdtx2d20nj7f
64.137.96.74:6641:xlvhmzvz:fdtx2d20nj7f
216.10.27.159:6837:xlvhmzvz:fdtx2d20nj7f
142.111.67.146:5611:xlvhmzvz:fdtx2d20nj7f
191.96.254.138:6185:xlvhmzvz:fdtx2d20nj7f
`;

const main = async () => {
  const { serverDB } = await import('../packages/database/src/server');
  const { voiceCallProxies } = await import('../packages/database/src/schemas');

  const lines = parseLines(INPUT);
  const urls = lines.map(toHttpProxyUrl);

  const existing = await serverDB.select().from(voiceCallProxies);
  const existingUrls = new Set(existing.map((r: any) => r.url));

  const toInsert = urls.filter((u) => !existingUrls.has(u));

  if (toInsert.length === 0) {
    console.log('Нечего добавлять: все прокси уже есть в базе.');
    return;
  }

  await serverDB.insert(voiceCallProxies).values(
    toInsert.map((url) => ({
      enabled: 1,
      priority: 1000,
      url,
    })),
  );

  console.log(`Добавлено прокси: ${toInsert.length}`);
  console.log(toInsert.join('\n'));
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


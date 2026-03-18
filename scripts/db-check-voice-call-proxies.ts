import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

// Load env for DB init
const env = process.env.NODE_ENV || 'development';
dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}` }));
dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${env}.local` }));

import { serverDB } from '../packages/database/src/server';

const main = async () => {
  const q =
    "select count(*)::int as cnt from voice_call_proxies where enabled = 1";
  const res = await (serverDB as any).execute(q);
  console.log(res?.rows ?? res);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


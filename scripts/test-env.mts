import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const loadEnv = () => {
  dotenvExpand.expand(dotenv.config());
  dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
  dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}` }));
  dotenvExpand.expand(
    dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}.local` }),
  );
};

loadEnv();

const apiKey = process.env.GOOGLE_API_KEY;
console.log(apiKey ? 'API KEY FOUND' : 'API KEY NOT FOUND');

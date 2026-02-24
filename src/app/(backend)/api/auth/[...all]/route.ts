import { toNextJsHandler } from 'better-auth/next-js';
import { type NextRequest } from 'next/server';

import { auth } from '@/auth';

const handler = toNextJsHandler(auth);

const withErrorLog =
  (method: 'GET' | 'POST') => async (req: NextRequest) => {
    try {
      const res = await (method === 'GET' ? handler.GET(req) : handler.POST(req));
      if (res.status >= 500) {
        console.error(
          `[auth] ${method} /api/auth/* returned ${res.status}. Ensure .env has DATABASE_URL, KEY_VAULTS_SECRET, AUTH_SECRET and run: bun run db:migrate`,
        );
      }
      return res;
    } catch (error) {
      console.error(`[auth] ${method} /api/auth/* error:`, error);
      throw error;
    }
  };

export const GET = withErrorLog('GET');
export const POST = withErrorLog('POST');

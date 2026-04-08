import { GoogleGenAI } from '@google/genai';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, private',
  'Pragma': 'no-cache',
};

const NEW_SESSION_TTL_MS = 10 * 60_000;
const TOKEN_EXPIRE_TTL_MS = 30 * 60_000;
const TOKEN_USES = 5;

export async function POST() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { headers: NO_STORE_HEADERS, status: 401 },
      );
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured.' },
        { headers: NO_STORE_HEADERS, status: 503 },
      );
    }

    const now = Date.now();
    const client = new GoogleGenAI({
      apiKey,
      httpOptions: {
        apiVersion: 'v1alpha',
      },
    });
    const token = await client.authTokens.create({
      config: {
        expireTime: new Date(now + TOKEN_EXPIRE_TTL_MS).toISOString(),
        newSessionExpireTime: new Date(now + NEW_SESSION_TTL_MS).toISOString(),
        uses: TOKEN_USES,
      },
    });

    const authToken = token.name?.trim() || '';
    if (!authToken) {
      throw new Error('Google auth token response is empty');
    }

    return NextResponse.json({ apiVersion: 'v1alpha', authToken }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error('[voice-call/auth-token] Failed to create auth token:', error);

    return NextResponse.json(
      { error: 'Failed to create live auth token.' },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
}

export const runtime = 'nodejs';

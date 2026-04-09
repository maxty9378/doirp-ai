import { timingSafeEqual } from 'node:crypto';

import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';

import { getLLMConfig } from '@/envs/llm';
import { getVoiceCallConfig } from '@/envs/voiceCall';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, private',
  'Pragma': 'no-cache',
};

const NEW_SESSION_TTL_MS = 10 * 60_000;
const TOKEN_EXPIRE_TTL_MS = 30 * 60_000;
const TOKEN_USES = 32;

const getBearerToken = (request: Request) => {
  const authorization = request.headers.get('authorization')?.trim() || '';
  if (!authorization.startsWith('Bearer ')) return '';

  return authorization.slice('Bearer '.length).trim();
};

const isAuthorized = (providedSecret: string, expectedSecret: string) => {
  if (!providedSecret || !expectedSecret) return false;

  const provided = Buffer.from(providedSecret);
  const expected = Buffer.from(expectedSecret);
  if (provided.length !== expected.length) return false;

  return timingSafeEqual(provided, expected);
};

export async function GET(request: Request) {
  const voiceCallEnv = getVoiceCallConfig();
  const sharedSecret = voiceCallEnv.VOICE_CALL_PROXY_SHARED_SECRET?.trim() || '';

  if (!sharedSecret) {
    return NextResponse.json(
      { error: 'VOICE_CALL_PROXY_SHARED_SECRET is not configured.' },
      { headers: NO_STORE_HEADERS, status: 503 },
    );
  }

  const providedSecret = getBearerToken(request);
  if (!isAuthorized(providedSecret, sharedSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { headers: NO_STORE_HEADERS, status: 401 });
  }

  const { GOOGLE_API_KEY } = getLLMConfig();
  const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

  if (!apiKey) {
    return NextResponse.json(
      { error: 'GOOGLE_API_KEY is not configured.' },
      { headers: NO_STORE_HEADERS, status: 503 },
    );
  }

  try {
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
    console.error('[voice-call/proxy-auth-token] Failed to create auth token:', error);

    return NextResponse.json(
      { error: 'Failed to create proxy live auth token.' },
      { headers: NO_STORE_HEADERS, status: 500 },
    );
  }
}

export const runtime = 'nodejs';

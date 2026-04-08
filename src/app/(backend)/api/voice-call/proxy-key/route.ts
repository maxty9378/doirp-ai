import { timingSafeEqual } from 'node:crypto';

import { NextResponse } from 'next/server';

import { getLLMConfig } from '@/envs/llm';
import { getVoiceCallConfig } from '@/envs/voiceCall';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0, private',
  'Pragma': 'no-cache',
};

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

  return NextResponse.json({ apiKey }, { headers: NO_STORE_HEADERS });
}

export const runtime = 'nodejs';

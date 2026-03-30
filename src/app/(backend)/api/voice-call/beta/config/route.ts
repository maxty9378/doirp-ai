import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';
const DEFAULT_VOICE = 'Aoede';
const PUBLIC_VOICE_PROXY_WS = 'wss://apidoirp.ru/voice-call-ws';

const normalizeProxyBaseUrl = (url: string | null | undefined) => {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    parsed.protocol = parsed.protocol === 'ws:' ? 'http:' : 'https:';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
};

const normalizeVoiceProxyUrl = (url: string | null | undefined) => {
  if (!url?.trim()) return null;

  try {
    const parsed = new URL(url.trim());
    const path = parsed.pathname.replace(/\/+$/, '');
    const isAuthProtectedProxy =
      parsed.hostname === 'doirp-ai.vercel.app' && path === '/voice-call-ws';

    if (isAuthProtectedProxy) {
      return PUBLIC_VOICE_PROXY_WS;
    }

    return parsed.toString();
  } catch {
    return url.trim();
  }
};

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured. Add it in .env or server settings.' },
        { status: 503 },
      );
    }

    const DEV_DEFAULT_VOICE_WS = PUBLIC_VOICE_PROXY_WS;
    const explicitProxyUrl = process.env.VOICE_CALL_WS_PROXY_URL?.trim() || null;
    const rawProxyUrl =
      (process.env.NODE_ENV === 'development'
        ? normalizeVoiceProxyUrl(explicitProxyUrl)
        : explicitProxyUrl) ||
      (process.env.NODE_ENV === 'development'
        ? normalizeVoiceProxyUrl(process.env.VOICE_CALL_WS_PROXY_DEV) || DEV_DEFAULT_VOICE_WS
        : null);

    return NextResponse.json({
      apiKey,
      defaultConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: DEFAULT_VOICE,
            },
          },
        },
      },
      defaultModel: DEFAULT_MODEL,
      defaultVoice: DEFAULT_VOICE,
      proxyBaseUrl: normalizeProxyBaseUrl(rawProxyUrl),
    });
  } catch (error) {
    console.error('[voice-call/beta/config] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

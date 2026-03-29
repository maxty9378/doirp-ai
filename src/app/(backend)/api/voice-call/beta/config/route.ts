import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import { Modality } from '@google/genai';

import { auth } from '@/auth';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';
const DEFAULT_VOICE = 'Aoede';

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

    const rawProxyUrl =
      process.env.VOICE_CALL_WS_PROXY_URL?.trim() ||
      (process.env.NODE_ENV === 'development' ? process.env.VOICE_CALL_WS_PROXY_DEV?.trim() : null);

    return NextResponse.json({
      apiKey,
      defaultConfig: {
        responseModalities: [Modality.AUDIO],
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

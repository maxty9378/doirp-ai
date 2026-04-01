import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

import { normalizeProxyBaseUrl, resolveVoiceCallWsProxyUrl } from '../../_wsProxyConfig';

const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';
const DEFAULT_VOICE = 'Aoede';

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

    const rawProxyUrl = resolveVoiceCallWsProxyUrl({
      devProxyUrl: process.env.VOICE_CALL_WS_PROXY_DEV,
      explicitProxyUrl: process.env.VOICE_CALL_WS_PROXY_URL,
      nodeEnv: process.env.NODE_ENV,
    });

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

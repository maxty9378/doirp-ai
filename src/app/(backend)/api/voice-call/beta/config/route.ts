import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { appEnv } from '@/envs/app';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

import { buildVoiceCallContextWindowCompression } from '../../../../../../utils/voiceCallLiveSession';
import { normalizeProxyBaseUrl, resolveVoiceCallWsProxyUrl } from '../../_wsProxyConfig';

const DEFAULT_MODEL = 'models/gemini-3.1-flash-live-preview';
const DEFAULT_MEDIA_RESOLUTION = 'MEDIA_RESOLUTION_MEDIUM';
const DEFAULT_VOICE = 'Aoede';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const rawProxyUrl = resolveVoiceCallWsProxyUrl({
      appUrl: appEnv.APP_URL,
      devProxyUrl: process.env.VOICE_CALL_WS_PROXY_DEV,
      explicitProxyUrl: process.env.VOICE_CALL_WS_PROXY_URL,
      nodeEnv: process.env.NODE_ENV,
      useAppTunnelInProduction: process.env.VOICE_CALL_WS_USE_TUNNEL === '1',
    });
    const proxyBaseUrl = normalizeProxyBaseUrl(rawProxyUrl);
    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!proxyBaseUrl && !apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured. Add it in .env or server settings.' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ...(proxyBaseUrl ? {} : { apiKey }),
      defaultConfig: {
        contextWindowCompression: buildVoiceCallContextWindowCompression(),
        mediaResolution: DEFAULT_MEDIA_RESOLUTION,
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
      proxyBaseUrl,
    });
  } catch (error) {
    console.error('[voice-call/beta/config] error', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

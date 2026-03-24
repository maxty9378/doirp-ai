import fs from 'node:fs';
import path from 'node:path';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { getLLMConfig } from '@/envs/llm';
import { getTrainingScenarioByKey } from '@/server/services/training';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

import { proxyFetch } from '../_proxyFetch';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const LEGEND_VOICE = 'Charon';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const sanitizeAgentId = (agentId: string) => agentId.replaceAll(/[^\w-]/g, '-');

const buildLegendText = (preset: {
  goals?: string[];
  scenario_context?: string;
  title?: string;
  user_role?: string;
}) => {
  const scenario = preset.scenario_context ?? '';
  const userRole = preset.user_role ?? '';
  const goals = preset.goals?.length ? preset.goals.map((goal) => `- ${goal}`).join('\n') : '';

  return [
    preset.title ? `Сценарий: ${preset.title}` : '',
    scenario ? `Легенда:\n${scenario}` : '',
    userRole ? `Роль:\n${userRole}` : '',
    goals ? `Цели:\n${goals}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
};

const buildTtsPrompt = (legendText: string) =>
  [
    'Прочитай как диктор трейлера к фильму: низким, уверенным мужским голосом, драматично и с паузами.',
    'Говори только на русском языке.',
    `Текст: ${legendText}`,
  ].join(' ');

const toWavFromPcm16 = (pcm16: Buffer, sampleRate = DEFAULT_SAMPLE_RATE) => {
  const channels = 1;
  const bitsPerSample = 16;
  const byteRate = (sampleRate * channels * bitsPerSample) / 8;
  const blockAlign = (channels * bitsPerSample) / 8;
  const wavSize = 44 + pcm16.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(wavSize - 8, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm16.length, 40);

  return Buffer.concat([header, pcm16]);
};

/**
 * POST /api/voice-call/generate-legend-audio
 * Body: { agentId?: string }
 */
export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json().catch(() => ({}))) as { agentId?: string };
    const agentId = body.agentId || 'training-tp-price-objection';
    const preset = VOICE_CALL_PRESETS[agentId];
    const scenario = await getTrainingScenarioByKey(agentId);

    const legendText = scenario
      ? buildLegendText({
          goals: scenario.goals || [],
          scenario_context: scenario.legend || '',
          title: scenario.title,
          user_role: scenario.userRole || '',
        })
      : preset
        ? buildLegendText(preset)
        : '';
    if (!legendText) {
      return NextResponse.json({ error: 'Legend text is empty' }, { status: 400 });
    }

    const { GOOGLE_API_KEY, GOOGLE_TTS_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_TTS_API_KEY ?? GOOGLE_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY is not configured' }, { status: 503 });
    }

    const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
    const endpoint = `${baseUrl}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const googleResponse = await proxyFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildTtsPrompt(legendText) }] }],
        generationConfig: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: LEGEND_VOICE },
            },
          },
        },
      }),
    });

    const result = (await googleResponse.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
      error?: { message?: string };
    };

    if (!googleResponse.ok) {
      return NextResponse.json(
        { error: result?.error?.message || 'Gemini TTS failed' },
        { status: googleResponse.status || 500 },
      );
    }

    const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inlineData?.data;
    if (!b64) {
      return NextResponse.json({ error: 'Gemini returned empty audio' }, { status: 502 });
    }

    const audioBuffer = Buffer.from(b64, 'base64');
    const mimeType = (inlineData?.mimeType || '').toLowerCase();
    const wavBuffer =
      mimeType.includes('audio/l16') || mimeType.includes('audio/pcm')
        ? toWavFromPcm16(audioBuffer)
        : audioBuffer;

    const filename = `legend-${sanitizeAgentId(agentId)}.wav`;
    const audioDir = path.join(process.cwd(), 'public', 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, filename), wavBuffer);

    return NextResponse.json({
      ok: true,
      url: `/audio/${filename}`,
    });
  } catch (error) {
    console.error('[voice-call/generate-legend-audio]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

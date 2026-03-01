import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';
import path from 'path';
import fs from 'fs';

import { auth } from '@/auth';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const LEGEND_VOICE = 'Charon';
const DEFAULT_SAMPLE_RATE = 24_000;
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const LEGEND_TEXT =
  'Вы — торговый представитель. Заходите в локальную розничную точку. ' +
  'ЛПР — Марина Ивановна, директор магазина. Она недовольна новым прайсом и готова вывести вашу позицию из матрицы. ' +
  'Ваша задача — отработать возражение «Дорого» в живом голосовом диалоге.';

/** Текст для Gemini: мужской голос, стиль трейлера */
const TTS_PROMPT = `Прочитай как диктор трейлера к фильму: низким, уверенным мужским голосом, драматично и с паузами. Текст: ${LEGEND_TEXT}`;

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

const LEGEND_FILENAME = 'legend-polevoi-boez.wav';

/**
 * POST /api/voice-call/generate-legend-audio
 * Генерирует озвучку легенды через Gemini TTS (мужской голос, стиль трейлера) и сохраняет в public/audio/legend-polevoi-boez.wav
 */
export async function POST() {
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
        { error: 'GOOGLE_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const endpoint = `${GOOGLE_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const googleResponse = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: TTS_PROMPT }] }],
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
      return NextResponse.json(
        { error: 'Gemini returned empty audio' },
        { status: 502 },
      );
    }

    const audioBuffer = Buffer.from(b64, 'base64');
    const mimeType = (inlineData?.mimeType || '').toLowerCase();
    const wavBuffer =
      mimeType.includes('audio/l16') || mimeType.includes('audio/pcm')
        ? toWavFromPcm16(audioBuffer)
        : audioBuffer;

    const publicDir = path.join(process.cwd(), 'public');
    const audioDir = path.join(publicDir, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    const filePath = path.join(audioDir, LEGEND_FILENAME);
    fs.writeFileSync(filePath, wavBuffer);

    return NextResponse.json({
      ok: true,
      url: `/audio/${LEGEND_FILENAME}`,
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

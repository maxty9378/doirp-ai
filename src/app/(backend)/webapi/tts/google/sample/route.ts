import { readFileSync, writeFileSync } from 'node:fs';
import { mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { NextResponse } from 'next/server';

import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const DEFAULT_VOICE = 'Kore';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const SAMPLE_TEXT = 'Это пример голоса. ДэОиЭрПэ АИ - генерируем будущее!';
const VOICES = ['Kore', 'Charon'] as const;
const VARIANTS = {
  brand: SAMPLE_TEXT,
  variant1: 'Заряди свой интеллект энергией нейросетей. Прокачайся с SNS!',
  variant2: 'Учись быстрее вместе с искусственным интеллектом. Прокачайся с SNS!',
  variant3: 'Твои новые возможности начинаются здесь. Прокачайся с SNS!',
  variant4: 'Синхронизируй знания с технологиями будущего. Прокачайся с SNS!',
} as const;
type VariantKey = keyof typeof VARIANTS;
const DEFAULT_VARIANT: VariantKey = 'brand';
const CACHE_DIR = join(process.cwd(), '.cache', 'tts-samples');

type SamplePayload = { buffer: Buffer; mimeType: string };

const SAMPLE_CACHE = new Map<string, SamplePayload>();
const IN_FLIGHT = new Map<string, Promise<SamplePayload>>();

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

const getCachePaths = (voice: string, variant: string) => {
  const safeVoice = voice.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  const safeVariant = variant.replace(/[^a-z0-9_-]/gi, '_').toLowerCase();
  return {
    audioPath: join(CACHE_DIR, `${safeVoice}__${safeVariant}.bin`),
    metaPath: join(CACHE_DIR, `${safeVoice}__${safeVariant}.json`),
  };
};

const readFromDisk = (voice: string, variant: string): SamplePayload | null => {
  const { audioPath, metaPath } = getCachePaths(voice, variant);
  if (!existsSync(audioPath) || !existsSync(metaPath)) return null;
  try {
    const meta = JSON.parse(readFileSync(metaPath, 'utf8')) as { mimeType?: string };
    const buffer = readFileSync(audioPath);
    return { buffer, mimeType: meta?.mimeType || 'audio/wav' };
  } catch {
    return null;
  }
};

const writeToDisk = (voice: string, variant: string, payload: SamplePayload) => {
  mkdirSync(CACHE_DIR, { recursive: true });
  const { audioPath, metaPath } = getCachePaths(voice, variant);
  writeFileSync(audioPath, payload.buffer);
  writeFileSync(metaPath, JSON.stringify({ mimeType: payload.mimeType }));
};

const synthesizeSample = async (
  voiceName: string,
  variantKey: VariantKey,
): Promise<SamplePayload> => {
  const { GOOGLE_API_KEY, GOOGLE_TTS_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
  const apiKey = apiKeyManager.pick(GOOGLE_TTS_API_KEY ?? GOOGLE_API_KEY);

  if (!apiKey) {
    throw new Error('GOOGLE_API_KEY is not configured');
  }

  const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
  const endpoint = `${baseUrl}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const googleResponse = await fetch(endpoint, {
    body: JSON.stringify({
      contents: [{ parts: [{ text: VARIANTS[variantKey] }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
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
    throw new Error(result?.error?.message || 'Failed to synthesize sample');
  }

  const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const b64 = inlineData?.data;

  if (!b64) {
    throw new Error('Gemini returned empty audio payload');
  }

  const audioBuffer = Buffer.from(b64, 'base64');
  const mimeType = inlineData?.mimeType || '';
  const outputBuffer =
    mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')
      ? toWavFromPcm16(audioBuffer)
      : audioBuffer;
  const outputMimeType =
    mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')
      ? 'audio/wav'
      : mimeType || 'audio/wav';

  return { buffer: outputBuffer, mimeType: outputMimeType };
};

const makeCacheKey = (voiceName: string, variantKey: VariantKey) =>
  `${voiceName}:${variantKey}`;

const ensureSample = async (voiceName: string, variantKey: VariantKey): Promise<SamplePayload> => {
  const cacheKey = makeCacheKey(voiceName, variantKey);
  const cached = SAMPLE_CACHE.get(cacheKey);
  if (cached) return cached;

  const disk = readFromDisk(voiceName, variantKey);
  if (disk) {
    SAMPLE_CACHE.set(cacheKey, disk);
    return disk;
  }

  const inFlight = IN_FLIGHT.get(cacheKey);
  if (inFlight) return inFlight;

  const promise = synthesizeSample(voiceName, variantKey)
    .then((payload) => {
      SAMPLE_CACHE.set(cacheKey, payload);
      writeToDisk(voiceName, variantKey, payload);
      return payload;
    })
    .finally(() => {
      IN_FLIGHT.delete(cacheKey);
    });

  IN_FLIGHT.set(cacheKey, promise);
  return promise;
};

const prewarm = () => {
  if (process.env.NODE_ENV === 'test') return;
  const variantKeys = Object.keys(VARIANTS) as VariantKey[];
  for (const voice of VOICES) {
    for (const variant of variantKeys) {
      void ensureSample(voice, variant).catch(() => undefined);
    }
  }
};

prewarm();

export const runtime = 'nodejs';

export const GET = async (req: Request) => {
  const url = new URL(req.url);
  const voiceName = (url.searchParams.get('voice') || DEFAULT_VOICE).trim();
  const variantRaw = (url.searchParams.get('variant') || DEFAULT_VARIANT).trim();
  const variantKey = (variantRaw || DEFAULT_VARIANT) as VariantKey;

  if (!voiceName) {
    return NextResponse.json({ error: 'Voice is required' }, { status: 400 });
  }

  if (!VOICES.includes(voiceName as (typeof VOICES)[number])) {
    return NextResponse.json({ error: 'Voice is not allowed' }, { status: 400 });
  }

  try {
    if (!VARIANTS[variantKey]) {
      return NextResponse.json({ error: 'Variant is not allowed' }, { status: 400 });
    }
    const payload = await ensureSample(voiceName, variantKey);
    return new Response(payload.buffer as any, {
      headers: {
        'Cache-Control': 'public, max-age=86400',
        'Content-Type': payload.mimeType,
        'X-Voice-Variant': variantKey,
      },
      status: 200,
    });
  } catch (error) {
    console.error('[webapi/tts/google/sample] Failed to synthesize sample', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
};

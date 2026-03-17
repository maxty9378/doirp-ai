import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const DEFAULT_SAMPLE_RATE = 24_000;
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const VOICES = ['Kore', 'Charon'] as const;
const VARIANTS = {
  variant1: 'Заряди свой интеллект энергией нейросетей. Прокачайся с SNS!',
  variant2: 'Учись быстрее вместе с искусственным интеллектом. Прокачайся с SNS!',
  variant3: 'Твои новые возможности начинаются здесь. Прокачайся с SNS!',
  variant4: 'Синхронизируй знания с технологиями будущего. Прокачайся с SNS!',
} as const;

const OUTPUT_DIR = join(process.cwd(), 'public', 'tts-samples');

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

const loadEnv = () => {
  dotenvExpand.expand(dotenv.config());
  dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
  dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}` }));
  dotenvExpand.expand(
    dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}.local` }),
  );
};

const synthesize = async (voiceName: string, text: string) => {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  const endpoint = `${GOOGLE_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    body: JSON.stringify({
      contents: [{ parts: [{ text }] }],
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

  const result = (await response.json()) as {
    candidates?: Array<{
      content?: {
        parts?: Array<{
          inlineData?: { data?: string; mimeType?: string };
        }>;
      };
    }>;
    error?: { message?: string };
  };

  if (!response.ok) {
    throw new Error(result?.error?.message || `TTS failed (${response.status})`);
  }

  const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const b64 = inlineData?.data;
  if (!b64) throw new Error('Gemini returned empty audio payload');

  const audioBuffer = Buffer.from(b64, 'base64');
  const mimeType = inlineData?.mimeType || '';
  if (mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')) {
    return { buffer: toWavFromPcm16(audioBuffer), mimeType: 'audio/wav' };
  }

  return { buffer: audioBuffer, mimeType: mimeType || 'audio/wav' };
};

const main = async () => {
  loadEnv();
  mkdirSync(OUTPUT_DIR, { recursive: true });

  for (const voice of VOICES) {
    for (const [variantKey, text] of Object.entries(VARIANTS)) {
      const outPath = join(OUTPUT_DIR, `${voice.toLowerCase()}-${variantKey}.wav`);
      console.log(`Generating ${voice} / ${variantKey} -> ${outPath}`);
      const { buffer } = await synthesize(voice, text);
      writeFileSync(outPath, buffer);
    }
  }

  console.log('Done.');
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

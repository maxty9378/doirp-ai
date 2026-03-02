/**
 * Генерирует озвучку легенд voice-call через Gemini TTS
 * и сохраняет в public/audio/legend-<agentId>.wav.
 *
 * Запуск:
 * bun run scripts/generate-legend-audio.mts
 *
 * Требуется GOOGLE_API_KEY в .env или .env.local
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

dotenvExpand.expand(dotenv.config());
dotenvExpand.expand(dotenv.config({ path: '.env.local' }));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const LEGEND_VOICE = 'Charon';
const SAMPLE_RATE = 24_000;
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const REQUEST_TIMEOUT_MS = 60_000;
const MAX_RETRIES = 3;

interface VoicePreset {
  goals?: string[];
  marketIdentifier?: string;
  scenario_context?: string;
  title?: string;
  user_role?: string;
}

const sanitizeAgentId = (agentId: string) => agentId.replaceAll(/[^\w-]/g, '-');

const readPreset = (filename: string): VoicePreset => {
  const filePath = path.join(ROOT, 'src', 'config', 'initialAgents', filename);
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as VoicePreset;
};

const buildLegendText = (preset: VoicePreset) => {
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

function toWavFromPcm16(pcm16: Buffer, sampleRate = SAMPLE_RATE): Buffer {
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
}

const generateLegendAudio = async (apiKey: string, agentId: string, legendText: string) => {
  const endpoint = `${GOOGLE_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
  let res: Response | undefined;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

      res = await fetch(endpoint, {
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
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      break;
    } catch (error) {
      if (attempt >= MAX_RETRIES) throw error;

      console.warn(
        `retry ${attempt}/${MAX_RETRIES} for ${agentId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }

  if (!res) throw new Error(`Gemini request failed for ${agentId}`);

  type GeminiTtsResponse = {
    candidates?: Array<{
      content?: {
        parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }>;
      };
    }>;
    error?: { message?: string };
  };
  const data = (await res.json()) as GeminiTtsResponse;

  if (!res.ok) {
    throw new Error(data?.error?.message || res.statusText);
  }

  const inlineData = data?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
  const b64 = inlineData?.data;
  if (!b64) throw new Error('Gemini returned empty audio');

  const audioBuffer = Buffer.from(b64, 'base64');
  const mimeType = (inlineData?.mimeType || '').toLowerCase();
  const wavBuffer =
    mimeType.includes('audio/l16') || mimeType.includes('audio/pcm')
      ? toWavFromPcm16(audioBuffer)
      : audioBuffer;

  const audioDir = path.join(ROOT, 'public', 'audio');
  fs.mkdirSync(audioDir, { recursive: true });
  const filePath = path.join(audioDir, `legend-${sanitizeAgentId(agentId)}.wav`);
  fs.writeFileSync(filePath, wavBuffer);
  return filePath;
};

async function main() {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    console.error('GOOGLE_API_KEY не задан. Добавьте в .env или .env.local');
    process.exit(1);
  }

  const presets: VoicePreset[] = [
    readPreset('trading-rep-price-objection.json'),
    readPreset('voice-simulator-lpr.json'),
  ];

  for (const preset of presets) {
    const agentId = preset.marketIdentifier;
    if (!agentId) continue;

    const legendText = buildLegendText(preset);
    if (!legendText) {
      console.warn(`skip ${agentId}: legend text is empty`);
      continue;
    }

    console.log(`generate ${agentId}...`);
    const filePath = await generateLegendAudio(apiKey, agentId, legendText);
    console.log(`saved: ${filePath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

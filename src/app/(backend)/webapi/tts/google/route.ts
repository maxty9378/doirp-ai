import { NextResponse } from 'next/server';

import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const DEFAULT_VOICE = 'Kore';
const DEFAULT_SAMPLE_RATE = 24_000;
const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

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

export const runtime = 'nodejs';

export const POST = async (req: Request) => {
  try {
    const payload = (await req.json()) as { text?: string; voice?: string };
    const text = payload?.text?.trim();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY is not configured' }, { status: 500 });
    }

    const voiceName = payload?.voice?.trim() || DEFAULT_VOICE;
    const endpoint = `${GOOGLE_API_BASE}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const googleResponse = await fetch(endpoint, {
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
        { error: result?.error?.message || 'Failed to synthesize speech with Gemini' },
        { status: googleResponse.status || 500 },
      );
    }

    const inlineData = result?.candidates?.[0]?.content?.parts?.[0]?.inlineData;
    const b64 = inlineData?.data;

    if (!b64) {
      return NextResponse.json({ error: 'Gemini returned empty audio payload' }, { status: 502 });
    }

    const audioBuffer = Buffer.from(b64, 'base64');
    const mimeType = inlineData?.mimeType || '';

    // Gemini TTS often returns raw PCM (e.g. audio/L16). Wrap it as WAV for browser playback.
    const outputBuffer =
      mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')
        ? toWavFromPcm16(audioBuffer)
        : audioBuffer;
    const outputMimeType =
      mimeType.toLowerCase().includes('audio/l16') || mimeType.toLowerCase().includes('audio/pcm')
        ? 'audio/wav'
        : mimeType || 'audio/wav';

    return new Response(outputBuffer, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': outputMimeType,
      },
      status: 200,
    });
  } catch (error) {
    console.error('[webapi/tts/google] Failed to synthesize speech', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
};

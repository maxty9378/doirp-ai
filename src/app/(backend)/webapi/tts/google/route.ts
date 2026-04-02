import { headers } from 'next/headers';
import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { NextResponse } from 'next/server';

import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { getSessionAdminUser } from '@/server/utils/admin';

const getProxyAgent = (): any | undefined => {
  const url =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith('socks')) return new SocksProxyAgent(u);
  return new HttpsProxyAgent(u);
};

const GEMINI_TTS_MODEL = 'gemini-2.5-pro-preview-tts';
const DEFAULT_VOICE = 'Kore';
const DEFAULT_SAMPLE_RATE = 24_000;
const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const execFileAsync = promisify(execFile);

let _ffmpegPath: string | null = null;

const getFfmpegPath = () => {
  if (_ffmpegPath) return _ffmpegPath;
  _ffmpegPath = require('ffmpeg-static') as string;
  return _ffmpegPath;
};

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

const toMp3 = async (input: Buffer, inputExt = 'wav') => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tts-mp3-'));
  const inputPath = path.join(tempDir, `input.${inputExt}`);
  const outputPath = path.join(tempDir, 'output.mp3');

  try {
    await fs.writeFile(inputPath, input);
    const ffmpegPath = getFfmpegPath();
    await execFileAsync(ffmpegPath, [
      '-y',
      '-i',
      inputPath,
      '-codec:a',
      'libmp3lame',
      '-b:a',
      '192k',
      outputPath,
    ]);
    return await fs.readFile(outputPath);
  } finally {
    await fs.rm(tempDir, { force: true, recursive: true });
  }
};

const ensureAdmin = async () => {
  return getSessionAdminUser();
};

export const runtime = 'nodejs';

export const POST = async (req: Request) => {
  try {
    const requestHeaders = await headers();
    const host = requestHeaders.get('host') || '';
    const isLocalHost =
      host.startsWith('localhost') ||
      host.startsWith('127.0.0.1') ||
      host.startsWith('[::1]');
    const allowLocalBypass =
      process.env.NODE_ENV !== 'production' && isLocalHost && process.env.LOCAL_TTS_BYPASS !== '0';

    const admin = await ensureAdmin();
    if (!admin && !allowLocalBypass) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const payload = (await req.json()) as { text?: string; voice?: string };
    const text = payload?.text?.trim();

    if (!text) {
      return NextResponse.json({ error: 'Text is required' }, { status: 400 });
    }

    const { GOOGLE_API_KEY, GOOGLE_TTS_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_TTS_API_KEY ?? GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY is not configured' }, { status: 500 });
    }

    const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
    const voiceName = payload?.voice?.trim() || DEFAULT_VOICE;
    const endpoint = `${baseUrl}/models/${GEMINI_TTS_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const fetchOptions = {
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
      method: 'POST' as const,
    };

    const agent = getProxyAgent();
    const googleResponse = await fetch(endpoint, {
      ...fetchOptions,
      ...(agent && { agent }),
    });

    let result: {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            inlineData?: { data?: string; mimeType?: string };
          }>;
        };
      }>;
      error?: { message?: string };
    };
    try {
      result = (await googleResponse.json()) as typeof result;
    } catch {
      const text = await googleResponse.text().catch(() => '');
      return NextResponse.json(
        {
          error:
            googleResponse.status === 429
              ? 'Превышен лимит запросов к API озвучки (429). Попробуйте позже или проверьте квоту ключа.'
              : `Ошибка ответа Gemini (${googleResponse.status}): ${text.slice(0, 200)}`,
        },
        { status: googleResponse.status >= 400 ? googleResponse.status : 502 },
      );
    }

    if (!googleResponse.ok) {
      const message =
        result?.error?.message ||
        (googleResponse.status === 429
          ? 'Превышен лимит запросов к API озвучки (429). Попробуйте позже.'
          : 'Не удалось синтезировать речь через Gemini.');
      return NextResponse.json({ error: message }, { status: googleResponse.status || 500 });
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

    const needsMp3 = !outputMimeType.toLowerCase().includes('audio/mpeg');
    const mp3Buffer = needsMp3
      ? await toMp3(outputBuffer, outputMimeType.toLowerCase().includes('wav') ? 'wav' : 'bin')
      : outputBuffer;

    return new Response(mp3Buffer, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'audio/mpeg',
      },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[webapi/tts/google] Failed to synthesize speech', error);
    return NextResponse.json(
      { error: message.includes('fetch') ? 'Нет доступа к API Gemini. Проверьте сеть или GOOGLE_API_BASE.' : message },
      { status: 500 },
    );
  }
};

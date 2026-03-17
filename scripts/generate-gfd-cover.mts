#!/usr/bin/env bun
/**
 * Генерация обложки для тренажёра GFD (Стресс‑интервью на выставке) через Google Gemini (Nano Banana).
 * Требует: GOOGLE_API_KEY (или GOOGLE_TTS_API_KEY), S3_* для загрузки, DATABASE_URL для обновления сценария.
 * Прокси: если HTTPS_PROXY начинается с http: или https: — используется для запроса к Gemini; socks5 не поддерживается (запрос идёт напрямую).
 *
 * Запуск: bun run generate:gfd-cover   или  pnpm exec tsx scripts/generate-gfd-cover.mts
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { HttpsProxyAgent } from 'https-proxy-agent';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { mkdirSync, writeFileSync } from 'node:fs';
import https from 'node:https';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const GFD_SCENARIO_KEY = 'training-gfd-stress';
const S3_KEY = 'voice-call/trainer-banner/gfd-cover.png';
const BANNER_URL_VALUE = '/webapi/voice-call/trainer-banner/gfd-cover.png';

// Модель Gemini для генерации изображений (Nano Banana)
const GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

// Промпт на английском — Gemini лучше работает с английским
const COVER_PROMPT = `Professional cover image for a corporate stress-interview training scenario at an international food and beverage exhibition. A confident young marketer stands at a modern branded drinks booth (energy drinks, functional beverages, cans and bottles on display). Bright exhibition hall with other stands in soft focus. Cinematic 16:9 composition, dramatic but professional lighting, high quality, no text on image.`;

function loadEnv() {
  dotenvExpand.expand(dotenv.config({ path: join(rootDir, '.env.local') }));
  dotenvExpand.expand(dotenv.config({ path: join(rootDir, '.env') }));
}

function getGeminiAgent(): https.Agent | false {
  const proxy = process.env.HTTPS_PROXY?.trim() || process.env.https_proxy?.trim();
  if (proxy && (proxy.startsWith('http:') || proxy.startsWith('https:'))) {
    return new HttpsProxyAgent(proxy) as unknown as https.Agent;
  }
  return false; // без прокси или socks5 (для socks5 запрос пойдёт напрямую)
}

function httpsPostJson(url: string, body: object): Promise<object> {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = JSON.stringify(body);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        agent: getGeminiAgent(),
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data, 'utf8'),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(chunk));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          try {
            const json = JSON.parse(raw) as object;
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(`Gemini API ${res.statusCode}: ${raw.slice(0, 300)}`));
            } else {
              resolve(json);
            }
          } catch {
            reject(new Error(`Invalid JSON: ${raw.slice(0, 200)}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

async function generateImageWithGemini(): Promise<{ buffer: Buffer; contentType: string }> {
  const apiKey =
    process.env.GOOGLE_API_KEY?.trim() || process.env.GOOGLE_TTS_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Set GOOGLE_API_KEY or GOOGLE_TTS_API_KEY in .env.local');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

  console.log('Calling Gemini (Nano Banana) for image generation...');
  const response = (await httpsPostJson(url, {
    contents: [{ role: 'user', parts: [{ text: COVER_PROMPT }] }],
    generationConfig: {
      responseModalities: ['Image'],
      imageConfig: { aspectRatio: '16:9' },
    },
  })) as { candidates?: Array<{ finishReason?: string; content?: { parts?: Array<{ inlineData?: { data?: string; mimeType?: string } }> } }> };

  const candidate = response.candidates?.[0];
  if (candidate?.finishReason === 'NO_IMAGE') {
    throw new Error('Gemini did not generate an image (NO_IMAGE)');
  }
  const parts = candidate?.content?.parts;
  if (!parts?.length) {
    throw new Error('Gemini returned no content (possible moderation or policy block)');
  }

  for (const part of parts) {
    const data = part?.inlineData;
    if (data?.data) {
      const buffer = Buffer.from(data.data, 'base64');
      const contentType = data.mimeType || 'image/png';
      return { buffer, contentType };
    }
  }

  throw new Error('No image data in Gemini response');
}

async function uploadToS3(buffer: Buffer, contentType: string): Promise<void> {
  const endpoint = process.env.S3_ENDPOINT;
  const bucket = process.env.S3_BUCKET;
  const accessKey = process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || 'us-east-1';
  const forcePathStyle = process.env.S3_ENABLE_PATH_STYLE === '1';

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    throw new Error('Set S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY in .env.local');
  }

  const client = new S3Client({
    credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
    endpoint,
    forcePathStyle,
    region,
  });

  console.log('Uploading to S3:', S3_KEY);
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: S3_KEY,
      Body: buffer,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

async function updateScenarioBannerUrl(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.trim()) {
    throw new Error('Set DATABASE_URL in .env.local');
  }

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const r = await client.query(
      `UPDATE training_scenarios SET banner_url = $1, updated_at = NOW() WHERE key = $2 RETURNING id`,
      [BANNER_URL_VALUE, GFD_SCENARIO_KEY],
    );
    if (r.rowCount === 0) {
      console.warn('No row updated: scenario with key', GFD_SCENARIO_KEY, 'may not exist yet. Create it from the app first.');
    } else {
      console.log('Updated scenario banner_url in DB');
    }
  } finally {
    await client.end();
  }
}

async function main() {
  loadEnv();

  console.log('1. Generating GFD cover with Gemini (Nano Banana)...');
  const { buffer, contentType } = await generateImageWithGemini();
  console.log('   Image size:', buffer.length, 'bytes');

  // Опционально: сохранить локально для проверки
  const outPath = join(rootDir, 'public', 'images', 'voice-call', 'gfd-cover-generated.png');
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, buffer);
    console.log('   Saved locally:', outPath);
  } catch {
    // ignore
  }

  console.log('2. Uploading to S3...');
  await uploadToS3(buffer, contentType);

  console.log('3. Updating scenario in DB...');
  await updateScenarioBannerUrl();

  console.log('Done. GFD cover URL:', BANNER_URL_VALUE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

#!/usr/bin/env bun
/**
 * Загрузка локального изображения как обложки тренажёра GFD.
 * Требует: S3_* в .env.local, DATABASE_URL.
 *
 * Использование: bun run scripts/upload-gfd-cover.mts <путь к файлу .png>
 * Пример:       bun run scripts/upload-gfd-cover.mts "C:\path\to\cover.png"
 */
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..');

const GFD_SCENARIO_KEY = 'training-gfd-stress';
const S3_KEY = 'voice-call/trainer-banner/gfd-cover.png';
const BANNER_URL_VALUE = '/webapi/voice-call/trainer-banner/gfd-cover.png';

function loadEnv() {
  dotenvExpand.expand(dotenv.config({ path: join(rootDir, '.env.local') }));
  dotenvExpand.expand(dotenv.config({ path: join(rootDir, '.env') }));
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
      console.warn('Сценарий с key', GFD_SCENARIO_KEY, 'не найден. Создайте его из приложения.');
    } else {
      console.log('Обложка сценария обновлена в БД');
    }
  } finally {
    await client.end();
  }
}

async function main() {
  const imagePath = process.argv[2];
  if (!imagePath) {
    console.error('Укажите путь к файлу изображения.');
    console.error('Пример: bun run scripts/upload-gfd-cover.mts "C:\\path\\to\\cover.png"');
    process.exit(1);
  }

  loadEnv();

  console.log('1. Reading image:', imagePath);
  let buffer: Buffer;
  try {
    buffer = readFileSync(imagePath);
  } catch (e) {
    console.error('Не удалось прочитать файл:', (e as Error).message);
    process.exit(1);
  }
  const contentType = 'image/png';
  console.log('   Size:', buffer.length, 'bytes');

  console.log('2. Uploading to S3...');
  await uploadToS3(buffer, contentType);

  console.log('3. Updating scenario in DB...');
  await updateScenarioBannerUrl();

  console.log('Готово. Обложка GFD:', BANNER_URL_VALUE);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

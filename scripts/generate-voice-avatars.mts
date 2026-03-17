import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { GoogleGenAI, PersonGeneration } from '@google/genai';
import * as dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';

const MODEL = 'imagen-4.0-generate-001';
const OUTPUT_DIR = join(process.cwd(), 'public', 'voice-avatars');

const VOICE_AVATARS = [
  {
    file: 'lyumira.png',
    name: 'Люмира',
    prompt:
      'Фотореалистичный портрет молодой русской женщины: естественная красота, мягкая улыбка, аккуратный макияж, студийный свет, нейтральный тёмный фон, без графики и текста, кадр 1:1.',
  },
  {
    file: 'severin.png',
    name: 'Северин',
    prompt:
      'Фотореалистичный портрет русского мужчины 30–40 лет: мужественные черты, короткая стрижка, лёгкая щетина, спокойный уверенный взгляд, студийный свет, нейтральный тёмный фон, без графики и текста, кадр 1:1.',
  },
];

const loadEnv = () => {
  dotenvExpand.expand(dotenv.config());
  dotenvExpand.expand(dotenv.config({ override: true, path: '.env.local' }));
  dotenvExpand.expand(dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}` }));
  dotenvExpand.expand(
    dotenv.config({ override: true, path: `.env.${process.env.NODE_ENV || 'development'}.local` }),
  );
};

const generateAvatar = async (client: GoogleGenAI, prompt: string) => {
  const response = await client.models.generateImages({
    config: {
      aspectRatio: '1:1',
      imageSize: '1K',
      numberOfImages: 1,
      outputMimeType: 'image/png',
      personGeneration: PersonGeneration.ALLOW_ADULT,
    },
    model: MODEL,
    prompt,
  });

  const image = response?.generatedImages?.[0]?.image;
  if (!image?.imageBytes) throw new Error('Gemini returned empty image payload');

  return Buffer.from(image.imageBytes, 'base64');
};

const main = async () => {
  loadEnv();
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY is not configured');

  mkdirSync(OUTPUT_DIR, { recursive: true });

  const client = new GoogleGenAI({ apiKey });

  for (const item of VOICE_AVATARS) {
    console.log(`Generating avatar for ${item.name} -> ${item.file}`);
    const buffer = await generateAvatar(client, item.prompt);
    writeFileSync(join(OUTPUT_DIR, item.file), buffer);
  }

  console.log('Done.');
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

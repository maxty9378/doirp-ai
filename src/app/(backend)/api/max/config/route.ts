import { promises as fs } from 'node:fs';
import path from 'node:path';

import { NextResponse } from 'next/server';

interface MaxConfigPayload {
  apiToken: string;
  baseUrl: string;
  botName: string;
  webhookUrl?: string;
}

export const GET = async () => {
  try {
    const configPath = path.join(process.cwd(), 'config.json');
    const raw = await fs.readFile(configPath, 'utf8');
    const config = JSON.parse(raw) as MaxConfigPayload & { updatedAt?: string };

    return NextResponse.json({ config, status: 'ok' });
  } catch {
    return NextResponse.json(
      {
        config: {
          apiToken: '',
          baseUrl: 'https://api.max-messenger.ru',
          botName: '',
          webhookUrl: '/api/max/webhook',
        },
        status: 'ok',
      },
      { status: 200 },
    );
  }
};

export const POST = async (req: Request) => {
  try {
    const payload = (await req.json()) as MaxConfigPayload;

    if (!payload?.apiToken || !payload?.baseUrl || !payload?.botName) {
      return NextResponse.json(
        { message: 'Не хватает обязательных полей', status: 'error' },
        { status: 400 },
      );
    }

    const configPath = path.join(process.cwd(), 'config.json');
    const config = {
      apiToken: payload.apiToken,
      baseUrl: payload.baseUrl,
      botName: payload.botName,
      updatedAt: new Date().toISOString(),
      webhookUrl: payload.webhookUrl ?? '/api/max/webhook',
    };

    await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');

    return NextResponse.json({ status: 'ok' });
  } catch (error) {
    console.error('Error saving MAX config:', error);
    return NextResponse.json(
      { message: 'Ошибка сохранения конфига', status: 'error' },
      { status: 500 },
    );
  }
};

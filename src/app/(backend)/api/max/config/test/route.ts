import { NextResponse } from 'next/server';

interface TestPayload {
  apiToken: string;
  baseUrl: string;
}

export const POST = async (req: Request) => {
  try {
    const payload = (await req.json()) as TestPayload;
    const baseUrl = payload.baseUrl?.trim();
    const apiToken = payload.apiToken?.trim();

    if (!baseUrl || !apiToken) {
      return NextResponse.json(
        { message: 'Укажите Base URL и API Token', status: 'error' },
        { status: 400 },
      );
    }

    const endpoint = `${baseUrl.replace(/\/$/, '')}/health`;
    let response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${apiToken}` },
      method: 'GET',
    });

    if (!response.ok) {
      const fallbackEndpoint = `${baseUrl.replace(/\/$/, '')}/profile`;
      response = await fetch(fallbackEndpoint, {
        headers: { Authorization: `Bearer ${apiToken}` },
        method: 'GET',
      });
    }

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { message: `Ошибка подключения: ${response.status} ${body}`, status: 'error' },
        { status: 502 },
      );
    }

    return NextResponse.json({ message: 'Соединение успешно установлено', status: 'ok' });
  } catch (error) {
    return NextResponse.json(
      { message: `Ошибка проверки соединения: ${String(error)}`, status: 'error' },
      { status: 500 },
    );
  }
};

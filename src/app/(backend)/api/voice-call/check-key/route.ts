import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

import { proxyFetch } from '../_proxyFetch';

const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * GET /api/voice-call/check-key
 * Проверяет, активен ли GOOGLE_API_KEY (доступ к Gemini API).
 * Требует авторизации.
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ valid: false, error: 'Unauthorized' }, { status: 401 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json({
        valid: false,
        error: 'GOOGLE_API_KEY не настроен. Добавьте в .env или настройки сервера.',
      });
    }

    const res = await proxyFetch(`${GEMINI_MODELS_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'GET',
    });

    if (res.ok) {
      return NextResponse.json({
        valid: true,
        message: 'Ключ активен. Доступ к Gemini API есть.',
      });
    }

    const body = await res.text();
    let errorMessage = `HTTP ${res.status}`;
    try {
      const json = JSON.parse(body);
      errorMessage = json?.error?.message || json?.error || errorMessage;
    } catch {
      if (body) errorMessage = body.slice(0, 200);
    }

    if (res.status === 401) {
      errorMessage = 'Ключ недействителен или истёк. Проверьте ключ в Google AI Studio.';
    } else if (res.status === 403) {
      errorMessage = 'Доступ запрещён. Включите Generative Language API и проверьте квоты/биллинг.';
    } else if (res.status === 429) {
      errorMessage = 'Превышен лимит запросов. Подождите или проверьте квоты.';
    }

    return NextResponse.json({
      valid: false,
      error: errorMessage,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      valid: false,
      error: `Ошибка проверки: ${message}`,
    });
  }
}

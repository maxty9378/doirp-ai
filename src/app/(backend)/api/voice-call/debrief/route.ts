import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

const DEBRIEF_PROMPT = (transcript: string) =>
  `Ты — эксперт по продажам и наставник. Ниже транскрипт диалога торгового представителя (ТП) с ЛПР (Марина Ивановна) в рамках тренажера по возражению "Дорого".

Транскрипт (реплики ЛПР):
"""
${transcript}
"""

Дай краткий разбор для менеджера (3–5 предложений):
1. Укажи 2 ошибки ТП в этом диалоге.
2. Укажи 1 сильную сторону менеджера.

Пиши по-русски, конкретно и доброжелательно. Без вступления.`;

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { transcript?: string };
    const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const endpoint = `${GOOGLE_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: DEBRIEF_PROMPT(transcript) }] }],
        generationConfig: {
          maxOutputTokens: 512,
          temperature: 0.4,
        },
      }),
    });

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'LLM request failed' },
        { status: res.status || 500 },
      );
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
      return NextResponse.json({ error: 'Empty debrief response' }, { status: 502 });
    }

    return NextResponse.json({ feedback: text });
  } catch (e) {
    console.error('[voice-call/debrief]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

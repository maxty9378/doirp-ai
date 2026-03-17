import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getTrainingScenarioByKey } from '@/server/services/training';

const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

const DEBRIEF_PROMPT = (transcript: string) =>
  `Ты — эксперт по коммуникациям и кризис-менеджменту. Ниже транскрипт стресс-интервью маркетолога компании с провокационной журналисткой.

Транскрипт:
"""
${transcript}
"""

Дай краткий разбор для сотрудника (3–5 предложений):

Укажи 2 ошибки (где поддался на провокацию или использовал слабый аргумент).
Укажи 1 сильную сторону (удачный ответ или сохранение хладнокровия).
Пиши по-русски, конкретно и доброжелательно. Без вступления.`;

async function buildDebriefPrompt(transcript: string, scenarioId?: string | null): Promise<string> {
  if (!scenarioId?.trim()) return DEBRIEF_PROMPT(transcript);
  const scenario = await getTrainingScenarioByKey(scenarioId.trim());
  const custom = scenario?.debriefPrompt?.trim();
  if (custom) return custom.replace(/\{\{transcript\}\}/g, transcript);
  return DEBRIEF_PROMPT(transcript);
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { transcript?: string; scenarioId?: string };
    const transcript = typeof body?.transcript === 'string' ? body.transcript.trim() : '';
    if (!transcript) {
      return NextResponse.json({ error: 'transcript is required' }, { status: 400 });
    }

    const promptText = await buildDebriefPrompt(transcript, body.scenarioId);

    const { GOOGLE_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);
    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured' },
        { status: 503 },
      );
    }

    const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
    const endpoint = `${baseUrl}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
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

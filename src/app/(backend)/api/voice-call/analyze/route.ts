import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

export interface TranscriptEntryInput {
  role: 'ai' | 'user';
  text: string;
}

export interface AnalyzeResponse {
  overallScore: number;
  competencies: Array<{ name: string; score: number }>;
  summary: string;
  strengths: string[];
  improvements: string[];
  phraseFeedback: Array<{
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
  }>;
}

function formatTranscript(entries: TranscriptEntryInput[]): string {
  return entries
    .map((e) => (e.role === 'ai' ? `ЛПР (Марина Ивановна): ${e.text}` : `ТП (стажер): ${e.text}`))
    .join('\n');
}

const ANALYZE_PROMPT = (transcript: string) =>
  `Ты — эксперт по продажам и тренер. Оцени транскрипт диалога торгового представителя (ТП) с ЛПР (Марина Ивановна) в тренажере по возражению "Дорого".

Транскрипт:
"""
${transcript}
"""

Верни ТОЛЬКО валидный JSON без markdown-обёртки, со следующей структурой:
{
  "overallScore": число от 0 до 100 (общий балл в процентах),
  "competencies": [
    { "name": "Управление конфликтами", "score": число 0-100 },
    { "name": "Активное слушание", "score": число 0-100 },
    { "name": "Навыки убеждения", "score": число 0-100 }
  ],
  "summary": "Краткое текстовое резюме (2-4 предложения): сильные стороны и области для улучшения.",
  "strengths": ["сильная сторона 1", "сильная сторона 2"],
  "improvements": ["что улучшить 1", "что улучшить 2"],
  "phraseFeedback": [
    {
      "userPhrase": "реплика стажера из транскрипта",
      "suggestedPhrase": "как лучше было сказать",
      "advice": "краткое пояснение, почему так лучше"
    }
  ]
}

Правила для phraseFeedback: разбери по очереди реплики ТП (стажера). Для каждой реплики дай один объект с предлагаемым улучшением. Если реплика была удачной — suggestedPhrase может совпадать или быть с небольшим улучшением, advice — что сделано хорошо.
Пиши все тексты по-русски.`;

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { transcript?: TranscriptEntryInput[] };
    const entries = Array.isArray(body?.transcript) ? body.transcript : [];
    const transcript = formatTranscript(entries);
    if (!transcript.trim()) {
      return NextResponse.json({ error: 'transcript is required (array of { role, text })' }, { status: 400 });
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
        contents: [{ parts: [{ text: ANALYZE_PROMPT(transcript) }] }],
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.3,
          responseMimeType: 'application/json',
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

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) {
      return NextResponse.json({ error: 'Empty analyze response' }, { status: 502 });
    }

    let parsed: AnalyzeResponse;
    try {
      const cleaned = raw.replace(/^```(?:json)?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(cleaned) as AnalyzeResponse;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON from model' }, { status: 502 });
    }

    if (typeof parsed.overallScore !== 'number') parsed.overallScore = 0;
    if (!Array.isArray(parsed.competencies)) parsed.competencies = [];
    if (typeof parsed.summary !== 'string') parsed.summary = '';
    if (!Array.isArray(parsed.strengths)) parsed.strengths = [];
    if (!Array.isArray(parsed.improvements)) parsed.improvements = [];
    if (!Array.isArray(parsed.phraseFeedback)) parsed.phraseFeedback = [];

    return NextResponse.json(parsed);
  } catch (e) {
    console.error('[voice-call/analyze]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

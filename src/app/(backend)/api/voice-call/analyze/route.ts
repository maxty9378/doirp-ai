import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getTrainingScenarioByKey } from '@/server/services/training';

const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
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
  recommendedAction?: string;
  phraseFeedback: Array<{
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
  }>;
}

function formatTranscript(entries: TranscriptEntryInput[]): string {
  return entries
    .map((e) => (e.role === 'ai' ? 'Собеседник: ' : 'Пользователь: ') + e.text)
    .join('\n');
}

const ANALYZE_PROMPT = (transcript: string) =>
  `Ты — эксперт по коммуникациям и кризис-менеджменту. Оцени транскрипт стресс-интервью маркетолога компании с провокационным собеседником.

Транскрипт:
"""
${transcript}
"""

Верни ТОЛЬКО валидный JSON без markdown-обёртки, со следующей структурой:
{
  "overallScore": число от 0 до 100 (общий балл в процентах),
  "competencies": [
    { "name": "Стрессоустойчивость", "score": число 0-100 },
    { "name": "Аргументация и фактология", "score": число 0-100 },
    { "name": "Управление конфликтом/эмоциями", "score": число 0-100 },
    { "name": "Следование этике бренда", "score": число 0-100 }
  ],
  "summary": "Краткое текстовое резюме (2-4 предложения): сильные стороны и области для улучшения.",
  "strengths": ["сильная сторона 1", "сильная сторона 2"],
  "improvements": ["что конкретно улучшить 1", "что конкретно улучшить 2"],
  "recommendedAction": "Рекомендованное следующее действие для развития навыков коммуникации",
  "phraseFeedback": [
    {
      "userPhrase": "реплика маркетолога из транскрипта",
      "suggestedPhrase": "как лучше было сказать в этой ситуации",
      "advice": "краткое пояснение, почему так лучше"
    }
  ]
}

Правила для phraseFeedback: разбери по очереди реплики маркетолога. Для каждой реплики дай один объект с предлагаемым улучшением. Если реплика была удачной — suggestedPhrase может совпадать или быть с небольшим улучшением, advice — что сделано хорошо.
Пиши все тексты по-русски.`;

function buildAnalyzePrompt(transcript: string, scenarioId?: string | null): Promise<string> {
  if (!scenarioId?.trim()) return Promise.resolve(ANALYZE_PROMPT(transcript));
  return getTrainingScenarioByKey(scenarioId.trim()).then((scenario) => {
    const custom = scenario?.analyzePrompt?.trim();
    if (custom) return custom.replace(/\{\{transcript\}\}/g, transcript);
    return ANALYZE_PROMPT(transcript);
  });
}

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as { transcript?: TranscriptEntryInput[]; scenarioId?: string };
    const entries = Array.isArray(body?.transcript) ? body.transcript : [];
    const transcript = formatTranscript(entries);
    if (!transcript.trim()) {
      return NextResponse.json({ error: 'transcript is required (array of { role, text })' }, { status: 400 });
    }

    const promptText = await buildAnalyzePrompt(transcript, body.scenarioId);

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

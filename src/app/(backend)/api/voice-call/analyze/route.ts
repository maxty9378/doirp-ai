import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { getTrainingScenarioByKey } from '@/server/services/training';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

import { proxyFetch } from '../_proxyFetch';

const DEFAULT_GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

export interface TranscriptEntryInput {
  role: 'ai' | 'user';
  text: string;
}

/** Приводит тело запроса к списку реплик с непустым текстом (устраняет 400 из-за «пустого» транскрипта). */
function normalizeTranscriptEntries(raw: unknown): TranscriptEntryInput[] {
  if (!Array.isArray(raw)) return [];
  const out: TranscriptEntryInput[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const o = item as { role?: unknown; text?: unknown };
    const text = typeof o.text === 'string' ? o.text.trim() : String(o.text ?? '').trim();
    if (!text) continue;
    const r = o.role;
    const role: 'ai' | 'user' =
      r === 'ai' || r === 'assistant' || r === 'model' || r === 'bot' ? 'ai' : 'user';
    out.push({ role, text });
  }
  return sanitizeVoiceCallTranscript(out);
}

export interface AnalyzeResponse {
  competencies: Array<{ name: string; score: number }>;
  improvements: string[];
  overallScore: number;
  phraseFeedback: Array<{
    userPhrase: string;
    suggestedPhrase: string;
    advice: string;
  }>;
  recommendedAction?: string;
  strengths: string[];
  summary: string;
}

function formatTranscript(entries: TranscriptEntryInput[]): string {
  return entries
    .map(
      (e) =>
        (e.role === 'ai' ? 'Собеседник (AI-провокатор): ' : 'Пользователь (Обучаемый): ') + e.text,
    )
    .join('\n');
}

const ANALYZE_PROMPT = (transcript: string) =>
  `Ты — эксперт по коммуникациям и бизнес-тренер. Оцени транскрипт стресс-интервью обучаемого (роль: "Пользователь (Обучаемый)") с провокационным ИИ-собеседником (роль: "Собеседник (AI-провокатор)").

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
      "userPhrase": "реплика обучаемого из транскрипта",
      "suggestedPhrase": "как лучше было сказать в этой ситуации",
      "advice": "краткое пояснение, почему так лучше"
    }
  ]
}

ВАЖНЫЕ ПРАВИЛА:
1. Анализируй ТОЛЬКО реплики, начинающиеся на "Пользователь (Обучаемый)". Не приписывай обучаемому реплики провокатора!
2. В phraseFeedback разбирай по очереди фразы обучаемого. Если фраза удачная — suggestedPhrase может совпадать или быть с небольшим улучшением, advice — что сделано хорошо.
3. Если "Пользователь (Обучаемый)" всё время молчал (нет его реплик в транскрипте), напиши об этом в summary (укажи на ступор/молчание), поставь низкий балл, а в phraseFeedback добавь один объект, где userPhrase — "[Молчание]", а suggestedPhrase — пример уверенного ответа на провокацию, чтобы начать диалог.
Пиши все тексты по-русски.`;

function buildAnalyzePrompt(transcript: string, scenarioId?: string | null): Promise<string> {
  if (!scenarioId?.trim()) return Promise.resolve(ANALYZE_PROMPT(transcript));
  return getTrainingScenarioByKey(scenarioId.trim()).then((scenario) => {
    const custom = scenario?.analyzePrompt?.trim();
    if (custom) return custom.replaceAll('{{transcript}}', transcript);
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

    const body = (await req.json()) as { transcript?: unknown; scenarioId?: string };
    const entries = normalizeTranscriptEntries(body?.transcript);
    const transcript = formatTranscript(entries);
    if (!transcript.trim()) {
      return NextResponse.json(
        {
          error:
            'Нужен непустой транскрипт: массив объектов { role: "user"|"ai", text: "…" } с непустым text.',
        },
        { status: 400 },
      );
    }

    const promptTextBase = await buildAnalyzePrompt(transcript, body.scenarioId);

    const hasUserLines = entries.some((e) => e.role === 'user');
    let promptText = promptTextBase;
    if (!hasUserLines) {
      promptText +=
        '\n\nВНИМАНИЕ: В данном транскрипте Пользователь (Обучаемый) не произнес ни одной фразы (молчал весь диалог). Обязательно отрази это в summary (поставь низкий балл за стрессоустойчивость) и в phraseFeedback (добавь один элемент: userPhrase="[Молчание]", suggestedPhrase="[Уверенный ответ для начала диалога]", advice="[Почему нельзя молчать]"). НЕ приписывай фразы Собеседника (ИИ-провокатора) Обучаемому!';
    } else {
      promptText +=
        '\n\nВНИМАНИЕ: Оценивай только реплики "Пользователь (Обучаемый):". Строго запрещено приписывать фразы "Собеседника (AI-провокатора):" Пользователю в phraseFeedback.';
    }

    const { GOOGLE_API_KEY, GOOGLE_API_BASE } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: 'GOOGLE_API_KEY is not configured' }, { status: 503 });
    }

    const baseUrl = GOOGLE_API_BASE?.trim() || DEFAULT_GOOGLE_API_BASE;
    const endpoint = `${baseUrl}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`;

    const res = await proxyFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        // Не задаём responseMimeType: часть моделей/регионов отвечает 400; JSON просим в промпте и парсим ниже.
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.3,
        },
      }),
    });

    const data = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!res.ok) {
      const msg = data?.error?.message || 'Ошибка запроса к модели анализа';
      console.warn('[voice-call/analyze] Ответ Gemini:', res.status, msg);
      return NextResponse.json(
        { error: msg },
        { status: res.status >= 400 && res.status < 600 ? res.status : 502 },
      );
    }

    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!raw) {
      return NextResponse.json({ error: 'Empty analyze response' }, { status: 502 });
    }

    let parsed: AnalyzeResponse;
    try {
      const cleaned = raw.replaceAll(/^```(?:json)?\s*|\s*```$/g, '').trim();
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

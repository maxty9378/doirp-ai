import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getTrainingScenarioByKey } from '@/server/services/training';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

import { generateGeminiStructuredJson } from '../_geminiStructured';
import { normalizeVoiceCallTranscriptWithGemini } from '../_normalizeTranscript';

const GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite-preview';
const ANALYZE_RESPONSE_SCHEMA = {
  properties: {
    behavioralMetrics: {
      properties: {
        repetitionAndRudeness: { type: 'STRING' as const },
        responseSpeed: { type: 'STRING' as const },
        silenceInfo: { type: 'STRING' as const },
      },
      required: ['silenceInfo', 'responseSpeed', 'repetitionAndRudeness'],
      type: 'OBJECT' as const,
    },
    competencies: {
      items: {
        properties: {
          name: { type: 'STRING' as const },
          score: { type: 'NUMBER' as const },
        },
        required: ['name', 'score'],
        type: 'OBJECT' as const,
      },
      type: 'ARRAY' as const,
    },
    improvements: {
      items: { type: 'STRING' as const },
      type: 'ARRAY' as const,
    },
    overallScore: { type: 'NUMBER' as const },
    phraseFeedback: {
      items: {
        properties: {
          advice: { type: 'STRING' as const },
          suggestedPhrase: { type: 'STRING' as const },
          userPhrase: { type: 'STRING' as const },
        },
        required: ['userPhrase', 'suggestedPhrase', 'advice'],
        type: 'OBJECT' as const,
      },
      type: 'ARRAY' as const,
    },
    recommendedAction: { type: 'STRING' as const },
    strengths: {
      items: { type: 'STRING' as const },
      type: 'ARRAY' as const,
    },
    summary: { type: 'STRING' as const },
  },
  required: [
    'overallScore',
    'competencies',
    'summary',
    'strengths',
    'improvements',
    'behavioralMetrics',
    'phraseFeedback',
  ],
  type: 'OBJECT' as const,
};

export interface TranscriptEntryInput {
  role: 'ai' | 'user';
  text: string;
}

export interface AnalyzeResponse {
  behavioralMetrics?: {
    silenceInfo?: string;
    responseSpeed?: string;
    repetitionAndRudeness?: string;
  };
  competencies: Array<{ name: string; score: number }>;
  improvements: string[];
  overallScore: number;
  phraseFeedback: Array<{
    advice: string;
    suggestedPhrase: string;
    userPhrase: string;
  }>;
  recommendedAction?: string;
  strengths: string[];
  summary: string;
}

/** Приводит тело запроса к списку реплик с непустым текстом. */
function normalizeTranscriptEntries(raw: unknown): TranscriptEntryInput[] {
  if (!Array.isArray(raw)) return [];

  const out: TranscriptEntryInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;

    const candidate = item as { role?: unknown; text?: unknown };
    const text =
      typeof candidate.text === 'string'
        ? candidate.text.trim()
        : String(candidate.text ?? '').trim();
    if (!text) continue;

    const roleValue = candidate.role;
    const role: 'ai' | 'user' =
      roleValue === 'ai' ||
      roleValue === 'assistant' ||
      roleValue === 'model' ||
      roleValue === 'bot'
        ? 'ai'
        : 'user';

    out.push({ role, text });
  }

  return sanitizeVoiceCallTranscript(out, { mode: 'analysis' });
}

function formatTranscript(entries: TranscriptEntryInput[]): string {
  return entries
    .map(
      (entry) =>
        `${
          entry.role === 'ai' ? 'Собеседник (AI-провокатор): ' : 'Пользователь (Обучаемый): '
        }${entry.text}`,
    )
    .join('\n');
}

const ANALYZE_PROMPT = (transcript: string, speakerName?: string, durationSec?: number) => {
  const speakerText = speakerName ? `Имя обучаемого: ${speakerName}. ` : '';
  const durationText = durationSec ? `Длительность звонка: ${durationSec} сек. ` : '';

  return `Ты — эксперт по коммуникациям и бизнес-тренер. Оцени транскрипт стресс-интервью обучаемого (роль: "Пользователь (Обучаемый)") с провокационным ИИ-собеседником (роль: "Собеседник (AI-провокатор)").
${speakerText}${durationText}

Транскрипт:
"""
${transcript}
"""

Верни объект анализа по схеме structured output.

ГАЙД ПО ОЦЕНКЕ (шкала 0-100):
- 0-20: критический провал, грубость, полное молчание или уход из диалога.
- 21-40: слабая позиция, много пауз, неуверенность, отсутствие аргументов.
- 41-60: средний результат, удовлетворительные ответы, но без инициативы.
- 61-80: хорошая работа, уверенная позиция, наличие фактов и аргументов.
- 81-100: блестящее владение ситуацией, идеальное хладнокровие, победа в споре.

ВАЖНЫЕ ПРАВИЛА:
1. Анализируй только реплики, начинающиеся на "Пользователь (Обучаемый):". Не приписывай обучаемому реплики провокатора.
2. В phraseFeedback разбирай по очереди фразы обучаемого. Если фраза удачная — suggestedPhrase может совпадать или быть с небольшим улучшением, advice — что сделано хорошо.
3. Если "Пользователь (Обучаемый)" всё время молчал, напиши об этом в summary, поставь низкий балл (0-10), а в phraseFeedback добавь один объект с userPhrase="[Молчание]".
4. Обязательно заполни behavioralMetrics, оценивая молчание, скорость реакции и повторы/грубость.
5. Все текстовые поля должны быть строго на русском языке.`;
};

function buildAnalyzePrompt(
  transcript: string,
  scenarioId?: string | null,
  speakerName?: string,
  durationSec?: number,
): Promise<string> {
  if (!scenarioId?.trim()) {
    return Promise.resolve(ANALYZE_PROMPT(transcript, speakerName, durationSec));
  }

  return getTrainingScenarioByKey(scenarioId.trim()).then((scenario) => {
    const custom = scenario?.analyzePrompt?.trim();
    if (custom) return custom.replaceAll('{{transcript}}', transcript);
    return ANALYZE_PROMPT(transcript, speakerName, durationSec);
  });
}

const normalizeAnalyzeResponse = (parsed: AnalyzeResponse): AnalyzeResponse => ({
  behavioralMetrics:
    parsed.behavioralMetrics && typeof parsed.behavioralMetrics === 'object'
      ? {
          repetitionAndRudeness:
            typeof parsed.behavioralMetrics.repetitionAndRudeness === 'string'
              ? parsed.behavioralMetrics.repetitionAndRudeness.trim()
              : undefined,
          responseSpeed:
            typeof parsed.behavioralMetrics.responseSpeed === 'string'
              ? parsed.behavioralMetrics.responseSpeed.trim()
              : undefined,
          silenceInfo:
            typeof parsed.behavioralMetrics.silenceInfo === 'string'
              ? parsed.behavioralMetrics.silenceInfo.trim()
              : undefined,
        }
      : undefined,
  competencies: Array.isArray(parsed.competencies)
    ? parsed.competencies
        .map((item) => ({
          name: typeof item?.name === 'string' ? item.name.trim() : '',
          score: Number.isFinite(item?.score) ? Number(item.score) : 0,
        }))
        .filter((item) => item.name.length > 0)
    : [],
  improvements: Array.isArray(parsed.improvements)
    ? parsed.improvements
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
    : [],
  overallScore: Number.isFinite(parsed.overallScore) ? Number(parsed.overallScore) : 0,
  phraseFeedback: Array.isArray(parsed.phraseFeedback)
    ? parsed.phraseFeedback
        .map((item) => ({
          advice: typeof item?.advice === 'string' ? item.advice.trim() : '',
          suggestedPhrase:
            typeof item?.suggestedPhrase === 'string' ? item.suggestedPhrase.trim() : '',
          userPhrase: typeof item?.userPhrase === 'string' ? item.userPhrase.trim() : '',
        }))
        .filter(
          (item) =>
            item.userPhrase.length > 0 && item.suggestedPhrase.length > 0 && item.advice.length > 0,
        )
    : [],
  recommendedAction:
    typeof parsed.recommendedAction === 'string' ? parsed.recommendedAction.trim() : undefined,
  strengths: Array.isArray(parsed.strengths)
    ? parsed.strengths.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean)
    : [],
  summary: typeof parsed.summary === 'string' ? parsed.summary.trim() : '',
});

export const runtime = 'nodejs';

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json()) as {
      durationSec?: number;
      scenarioId?: string;
      speakerName?: string;
      transcript?: unknown;
    };

    const normalizedEntries = normalizeTranscriptEntries(body?.transcript);
    const entries = await normalizeVoiceCallTranscriptWithGemini(normalizedEntries, {
      force: true,
    });
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

    const promptTextBase = await buildAnalyzePrompt(
      transcript,
      body.scenarioId,
      body.speakerName,
      body.durationSec,
    );

    const hasUserLines = entries.some((entry) => entry.role === 'user');
    let promptText = promptTextBase;

    if (!hasUserLines) {
      promptText +=
        '\n\nВНИМАНИЕ: В данном транскрипте Пользователь (Обучаемый) не произнес ни одной фразы. Обязательно отрази это в summary, поставь низкий балл и добавь в phraseFeedback один объект с userPhrase="[Молчание]".';
    } else {
      promptText +=
        '\n\nВНИМАНИЕ: Оценивай только реплики "Пользователь (Обучаемый):". Строго запрещено приписывать фразы "Собеседника (AI-провокатора):" пользователю в phraseFeedback.';
    }

    const parsed = await generateGeminiStructuredJson<AnalyzeResponse>({
      emptyResponseMessage: 'Empty analyze response',
      maxOutputTokens: 4096,
      model: GEMINI_TEXT_MODEL,
      promptText,
      responseSchema: ANALYZE_RESPONSE_SCHEMA,
      temperature: 0.3,
    });

    return NextResponse.json({
      ...normalizeAnalyzeResponse(parsed),
      normalizedTranscript: entries,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('[voice-call/analyze]', error);

    const isGeoBlocked = /location|region|not supported|restricted|country|geo/i.test(message);
    const userFriendlyError = isGeoBlocked
      ? 'Сервис анализа временно недоступен в вашем регионе. Пожалуйста, проверьте настройки подключения или попробуйте позже.'
      : message;

    return NextResponse.json({ error: userFriendlyError }, { status: 500 });
  }
}

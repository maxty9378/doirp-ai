import {
  sanitizeVoiceCallTranscript,
  type VoiceCallTranscriptEntry,
} from '@/utils/voiceCallEchoFilter';

import { generateGeminiStructuredJson } from './_geminiStructured';

const GEMINI_TEXT_MODEL = 'gemini-3.1-flash-lite-preview';
const BROKEN_HYPHEN_PATTERN = /\b\p{Script=Cyrillic}+\s+-\s+\p{Script=Cyrillic}+\b/iu;
const SHORT_CYRILLIC_PATTERN = /\p{Script=Cyrillic}+/gu;
const NORMALIZE_TRANSCRIPT_SCHEMA = {
  properties: {
    items: {
      items: {
        properties: {
          index: { type: 'INTEGER' as const },
          text: { type: 'STRING' as const },
        },
        required: ['index', 'text'],
        type: 'OBJECT' as const,
      },
      type: 'ARRAY' as const,
    },
  },
  required: ['items'],
  type: 'OBJECT' as const,
};

interface NormalizeTranscriptOptions {
  force?: boolean;
}

interface NormalizeTranscriptResponse {
  items?: Array<{
    index?: number;
    text?: string;
  }>;
}

const extractShortTokenRun = (text: string) => {
  const tokens = text.match(SHORT_CYRILLIC_PATTERN) ?? [];
  let maxRun = 0;
  let currentRun = 0;

  for (const token of tokens) {
    if (token.length <= 3) {
      currentRun += 1;
      maxRun = Math.max(maxRun, currentRun);
      continue;
    }

    currentRun = 0;
  }

  return maxRun;
};

const looksLikeBrokenAsrText = (text: string) => {
  if (BROKEN_HYPHEN_PATTERN.test(text)) return true;
  return extractShortTokenRun(text) >= 3;
};

const shouldNormalizeWithGemini = (transcript: VoiceCallTranscriptEntry[]) =>
  transcript.some((entry) => entry.role === 'user' && looksLikeBrokenAsrText(entry.text));

const buildNormalizePrompt = (items: Array<{ index: number; text: string }>) =>
  `Ты приводишь к читаемому виду сырую ASR-транскрипцию русской речи.

Правила:
1. Сохрани все индексы из входного JSON.
2. Исправляй только явные артефакты распознавания речи: разорванные слова, разорванные дефисы, склейку слогов, случайные дубли коротких кусков и лишние пробелы.
3. Не улучшай ответ по смыслу. Не добавляй новые факты, аргументы или формулировки, которых не было.
4. Если сомневаешься, оставь текст максимально близко к оригиналу.
5. Пиши строго на кириллице. Не используй латиницу или транслит для русских слов.

Верни объект с полем items.

Входной JSON:
${JSON.stringify({ items }, null, 2)}`;

export const normalizeVoiceCallTranscriptWithGemini = async (
  rawTranscript: VoiceCallTranscriptEntry[],
  options?: NormalizeTranscriptOptions,
) => {
  const transcript = sanitizeVoiceCallTranscript(rawTranscript, { mode: 'store' });
  if (transcript.length === 0) return transcript;
  if (!options?.force && !shouldNormalizeWithGemini(transcript)) return transcript;

  const userItems = transcript
    .map((entry, index) =>
      entry.role === 'user'
        ? {
            index,
            text: entry.text,
          }
        : null,
    )
    .filter((item): item is { index: number; text: string } => item !== null);

  if (userItems.length === 0) return transcript;

  try {
    const parsed = await generateGeminiStructuredJson<NormalizeTranscriptResponse>({
      emptyResponseMessage: 'Empty normalize transcript response',
      maxOutputTokens: 2048,
      model: GEMINI_TEXT_MODEL,
      promptText: buildNormalizePrompt(userItems),
      responseSchema: NORMALIZE_TRANSCRIPT_SCHEMA,
      temperature: 0.05,
    });

    if (!Array.isArray(parsed.items)) return transcript;

    const normalized = [...transcript];

    for (const item of parsed.items) {
      const index = typeof item.index === 'number' ? item.index : -1;
      if (index < 0 || index >= normalized.length) continue;
      if (normalized[index]?.role !== 'user') continue;
      if (typeof item.text !== 'string') continue;

      const nextText = item.text.trim();
      if (!nextText) continue;

      normalized[index] = {
        ...normalized[index],
        text: nextText,
      };
    }

    return sanitizeVoiceCallTranscript(normalized, { mode: 'store' });
  } catch (error) {
    console.warn('[voice-call/normalizeTranscript] Fallback to sanitized transcript:', error);
    return transcript;
  }
};

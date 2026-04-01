import { stripEnglishReasoning } from './stripEnglishReasoning';

const THINK_TAG_RE = /<think>[\s\S]*?<\/think>/gi;
const CURRENT_SCORE_TAG_RE =
  /(?:\[\s*CURRENT_SCORE\s*:|CURRENT_SCORE\s*:)\s*(?:[-+]\s*)?\d+\s*\]?/gi;
const SCORE_TAG_RE = /(?:\[\s*SCORE\s*:|SCORE\s*:)\s*(?:[-+]\s*)?\d+\s*\]?/gi;
const CHECKPOINT_TAG_RE = /(?:\[\s*CHECKPOINT\s*:|CHECKPOINT\s*:)\s*[A-Z_]+\s*\]?/gi;
const PLANNER_META_TAG_RE = /\[\s*(?:weaknessCode|responseMode)\s*:\s*(?:[^\s[\]][^[\]\r\n]*)?\]/gi;

const VOICE_META_INSTRUCTION_LINE_PATTERNS = [
  /\[\s*weaknessCode\s*:/i,
  /\[\s*responseMode\s*:/i,
  /служебн\S*\s+тег/i,
  /техническ.*\bweaknessCode\b/i,
  /техническ.*\bresponseMode\b/i,
  /техническ.*\bui\b/i,
  /техническ\S*\s+информац/i,
  /не\s+долж.*произнос/i,
];

const VOICE_PLANNER_META_GUARD =
  'Не добавляй в ответ служебные поля, теги в квадратных скобках или метаданные. В ответе должен быть только живой текст реплики.';

export const stripVoiceCallSystemTags = (text: string) =>
  text
    .replaceAll(THINK_TAG_RE, '')
    .replaceAll(CURRENT_SCORE_TAG_RE, '')
    .replaceAll(SCORE_TAG_RE, '')
    .replaceAll(CHECKPOINT_TAG_RE, '')
    .replaceAll(PLANNER_META_TAG_RE, '');

export const cleanVoiceAiText = (text: string, options?: { stripEnglishReasoning?: boolean }) => {
  let cleaned = stripVoiceCallSystemTags(text).replaceAll(/\s+/g, ' ');
  if (options?.stripEnglishReasoning !== false) cleaned = stripEnglishReasoning(cleaned);

  return cleaned.trim();
};

export const sanitizeVoiceSystemInstruction = (prompt: string) => {
  const filtered = prompt
    .split(/\r?\n/)
    .filter(
      (line) => !VOICE_META_INSTRUCTION_LINE_PATTERNS.some((pattern) => pattern.test(line.trim())),
    )
    .join('\n')
    .replaceAll(PLANNER_META_TAG_RE, '')
    .replaceAll(/\n{3,}/g, '\n\n')
    .trim();

  if (!filtered) return VOICE_PLANNER_META_GUARD;
  if (filtered.includes(VOICE_PLANNER_META_GUARD)) return filtered;

  return `${filtered}\n\n${VOICE_PLANNER_META_GUARD}`;
};

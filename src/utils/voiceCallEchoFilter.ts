import { stripEnglishReasoning } from './stripEnglishReasoning';

export interface VoiceCallTranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export const normalizeEchoText = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ');

const tokenize = (text: string) => normalizeEchoText(text).split(' ').filter(Boolean);

const cleanAiTextForStore = (text: string, options?: { stripEnglishReasoning?: boolean }) => {
  let cleaned = text;
  cleaned = cleaned.replaceAll(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*SCORE\s*:|SCORE\s*:)\s*(?:[-+]\s*)?\d+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*CHECKPOINT\s*:|CHECKPOINT\s*:)\s*[A-Z_]+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/\s+/g, ' ');
  if (options?.stripEnglishReasoning !== false) cleaned = stripEnglishReasoning(cleaned);
  return cleaned.trim();
};

const USER_WORD_JOIN_STOPWORDS = new Set([
  'а',
  'бы',
  'был',
  'была',
  'были',
  'было',
  'быть',
  'в',
  'вас',
  'вот',
  'вроде',
  'все',
  'всё',
  'вы',
  'где',
  'да',
  'для',
  'до',
  'его',
  'ее',
  'её',
  'если',
  'еще',
  'ещё',
  'же',
  'за',
  'знаю',
  'и',
  'или',
  'их',
  'к',
  'как',
  'когда',
  'кто',
  'ли',
  'мы',
  'на',
  'не',
  'но',
  'ну',
  'о',
  'он',
  'она',
  'они',
  'от',
  'по',
  'под',
  'при',
  'просто',
  'с',
  'так',
  'там',
  'то',
  'тут',
  'ты',
  'у',
  'уже',
  'что',
  'это',
  'этом',
  'я',
]);

const normalizeUserTranscriptText = (text: string) => {
  let normalized = text.trim();
  if (!normalized) return normalized;

  normalized = normalized
    .replaceAll(/\s+([,.;!?])/g, '$1')
    .replaceAll(/([([{])\s+/g, '$1')
    .replaceAll(/\s+([)\]}])/g, '$1')
    .replaceAll(/\s{2,}/g, ' ');

  normalized = normalized.replaceAll(
    /\b(кто|что|где|когда|куда|откуда|почему|зачем|какой|какая|какое|какие|чей|чья|чье|чьи)\s+(то|либо|нибудь)\b/giu,
    '$1-$2',
  );

  const shouldJoinSplitWord = (parts: string[]) => {
    if (parts.length < 2) return false;

    const lowered = parts.map((part) => part.toLowerCase());
    if (lowered[0] === 'не') return parts.length >= 3;
    if (lowered.some((part) => USER_WORD_JOIN_STOPWORDS.has(part))) return false;

    if (parts.length === 2) {
      const [first, second] = parts;
      if (first.length === 1 || second.length === 1) return false;
      if (first.length <= 2 && second.length >= 5) return true;
      return first.length >= 3 && second.length >= 2 && first.length + second.length >= 5;
    }

    return parts[0].length >= 2 && parts.slice(1).every((part) => part.length <= 4);
  };

  const joinPattern =
    /\b(\p{scx=Cyrl}{2,4})\s+(\p{scx=Cyrl}{2,8})(?:\s+(\p{scx=Cyrl}{2,4}))?(?:\s+(\p{scx=Cyrl}{2,4}))?\b/giu;

  for (let iteration = 0; iteration < 3; iteration++) {
    normalized = normalized.replaceAll(joinPattern, (match, p1, p2, p3, p4) => {
      const parts = [p1, p2, p3, p4].filter(Boolean);
      if (!shouldJoinSplitWord(parts)) return match;
      return parts.join('');
    });
  }

  return normalized.replaceAll(/\s{2,}/g, ' ').trim();
};

const mergeAdjacentTranscriptText = (prev: string, next: string) => {
  const a = prev.trim();
  const b = next.trim();

  if (!a) return b;
  if (!b) return a;
  if (a === b) return a;
  if (b.startsWith(a)) return b;
  if (a.startsWith(b)) return a;

  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  let maxOverlap = 0;

  for (let i = 1; i <= Math.min(wordsA.length, wordsB.length); i++) {
    const suffixA = normalizeEchoText(wordsA.slice(-i).join(' '));
    const prefixB = normalizeEchoText(wordsB.slice(0, i).join(' '));
    if (suffixA && suffixA === prefixB) maxOverlap = i;
  }

  if (maxOverlap > 0) {
    const keepA = wordsA.slice(0, wordsA.length - maxOverlap).join(' ');
    return keepA ? `${keepA} ${b}` : b;
  }

  return `${a} ${b}`;
};

const SHORT_USER_UTTERANCES_KEEP = new Set(['да', 'нет', 'угу', 'ага', 'ок', 'окей', 'готово']);

const looksLikeNoisyUserFragment = (text: string) => {
  const normalized = normalizeEchoText(text);
  if (!normalized) return true;
  if (SHORT_USER_UTTERANCES_KEEP.has(normalized)) return false;

  // Слишком короткие «обрывки»
  if (normalized.length <= 4) return true;

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length === 1 && tokens[0].length <= 6) return true;

  return false;
};

const jaccard = (a: string[], b: string[]) => {
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter += 1;
  const union = setA.size + setB.size - inter;
  return union ? inter / union : 0;
};

export const isLikelyEcho = (userText: string, aiText: string) => {
  const u = normalizeEchoText(userText);
  const a = normalizeEchoText(aiText);

  if (u.length < 12 || a.length < 12) return false;
  if (u === a) return true;

  const minLen = Math.min(u.length, a.length);
  const maxLen = Math.max(u.length, a.length);
  // Считаем эхом только при очень сильном совпадении текста (подстрока + близкие длины).
  if ((a.includes(u) || u.includes(a)) && minLen / maxLen >= 0.7) return true;

  // Страховка для ASR-ошибок: высокая похожесть по токенам + близкие длины.
  const uTokens = tokenize(u);
  const aTokens = tokenize(a);
  if (
    uTokens.length >= 5 &&
    aTokens.length >= 5 &&
    minLen / maxLen >= 0.65 &&
    jaccard(uTokens, aTokens) >= 0.78
  )
    return true;

  return false;
};

/**
 * Удаляет «эхо»-реплики пользователя, совпадающие с соседней репликой ИИ.
 * Используется как страховка, если распознавание речи ошибочно сняло голос ИИ как «речь пользователя».
 */
export const dropLikelyEchoUserEntries = <T extends VoiceCallTranscriptEntry>(
  entries: T[],
): T[] => {
  if (entries.length < 2) return entries;

  const out: T[] = [];
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (entry.role !== 'user') {
      out.push(entry);
      continue;
    }

    const prev = entries[i - 1];
    const next = entries[i + 1];
    const neighborAiText = prev?.role === 'ai' ? prev.text : next?.role === 'ai' ? next.text : '';

    if (neighborAiText && isLikelyEcho(entry.text, neighborAiText)) continue;
    out.push(entry);
  }

  return out;
};

/** Удаляет «эхо»-реплики пользователя, которые похожи на ЛЮБУЮ реплику ИИ в этом же транскрипте. */
export const dropLikelyEchoUserEntriesAgainstAiCorpus = <T extends VoiceCallTranscriptEntry>(
  entries: T[],
): T[] => {
  const aiTexts = entries
    .filter((e) => e.role === 'ai')
    .map((e) => e.text)
    .filter(Boolean);
  if (aiTexts.length === 0) return entries;

  return entries.filter((e) => {
    if (e.role !== 'user') return true;
    return !aiTexts.some((ai) => isLikelyEcho(e.text, ai));
  });
};

export const mergeAdjacentTranscriptEntries = <T extends VoiceCallTranscriptEntry>(
  entries: T[],
  options?: { mergeUser?: boolean },
): T[] => {
  if (entries.length < 2) return entries;

  const merged: T[] = [];

  for (const entry of entries) {
    const last = merged.at(-1);
    const shouldKeepSeparateUserEntry = entry.role === 'user' && options?.mergeUser === false;
    if (!last || last.role !== entry.role || shouldKeepSeparateUserEntry) {
      merged.push({ ...entry });
      continue;
    }

    last.text = mergeAdjacentTranscriptText(last.text, entry.text);
  }

  return merged;
};

/** Нормализует транскрипт для сохранения/анализа: trim + удаление вероятного «эха». */
export const sanitizeVoiceCallTranscript = <T extends VoiceCallTranscriptEntry>(
  entries: T[],
  options?: { mode?: 'store' | 'analysis' },
): T[] => {
  const trimmed = entries
    .map((e) => {
      const raw = typeof e.text === 'string' ? e.text : String(e.text ?? '');
      const nextText = e.role === 'ai' ? cleanAiTextForStore(raw) : normalizeUserTranscriptText(raw);
      return { ...e, text: nextText };
    })
    .filter((e) => e.text.length > 0) as T[];

  if (trimmed.length === 0) return trimmed;
  const noAdjacentEcho = dropLikelyEchoUserEntries(trimmed);
  const withoutNoise =
    options?.mode === 'analysis'
      ? (noAdjacentEcho.filter((e) =>
          e.role === 'user' ? !looksLikeNoisyUserFragment(e.text) : true,
        ) as T[])
      : noAdjacentEcho;
  const merged = mergeAdjacentTranscriptEntries(withoutNoise, {
    mergeUser: options?.mode !== 'analysis',
  });
  if (options?.mode !== 'analysis') return merged;

  const noEcho = dropLikelyEchoUserEntriesAgainstAiCorpus(merged);

  // Для анализа дополнительно выкидываем «шумовые» короткие обрывки речи пользователя,
  // чтобы LLM не превращал их в phraseFeedback.
  return noEcho;
};

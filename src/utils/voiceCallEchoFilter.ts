export interface VoiceCallTranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export const normalizeEchoText = (text: string) =>
  text
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replaceAll(/\s+/g, ' ');

export const isLikelyEcho = (userText: string, aiText: string) => {
  const u = normalizeEchoText(userText);
  const a = normalizeEchoText(aiText);

  if (u.length < 12 || a.length < 12) return false;
  if (u === a) return true;

  const minLen = Math.min(u.length, a.length);
  const maxLen = Math.max(u.length, a.length);
  // Считаем эхом только при очень сильном совпадении текста (подстрока + близкие длины).
  if ((a.includes(u) || u.includes(a)) && minLen / maxLen >= 0.7) return true;

  return false;
};

/**
 * Удаляет «эхо»-реплики пользователя, совпадающие с соседней репликой ИИ.
 * Используется как страховка, если распознавание речи ошибочно сняло голос ИИ как «речь пользователя».
 */
export const dropLikelyEchoUserEntries = <T extends VoiceCallTranscriptEntry>(entries: T[]): T[] => {
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
    const neighborAiText =
      prev?.role === 'ai' ? prev.text : next?.role === 'ai' ? next.text : '';

    if (neighborAiText && isLikelyEcho(entry.text, neighborAiText)) continue;
    out.push(entry);
  }

  return out;
};


/**
 * Убирает длинные строки без кириллицы (часто это «служебные» рассуждения/мета-текст модели).
 * Оставляет:
 * - строки с кириллицей;
 * - без кириллицы — только очень короткие фрагменты (цифры, %, аббревиатуры до 8 символов).
 */
export function stripEnglishReasoning(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';

  const parts = trimmed
    .split(/\n+/)
    .flatMap((l) => l.split(/(?<=[.?!])\s+/))
    .map((l) => l.trim())
    .filter(Boolean);

  const kept = parts.filter((line) => {
    if (/\p{Script=Cyrl}/u.test(line)) return true;
    if (line.length <= 8) return true;
    return false;
  });

  return kept.join(' ').trim();
}

/**
 * Убирает английские рассуждения из текста ответа модели, оставляет реплику на русском.
 * Оставляет: строки с кириллицей; без кириллицы — только очень короткие фрагменты (цифры, %, аббревиатуры до 8 символов).
 */
export function stripEnglishReasoning(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return '';
  const lines = trimmed.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((line) => {
    if (/[а-яёА-ЯЁ]/.test(line)) return true;
    if (line.length <= 8) return true;
    return false;
  });
  return kept.join(' ').trim();
}

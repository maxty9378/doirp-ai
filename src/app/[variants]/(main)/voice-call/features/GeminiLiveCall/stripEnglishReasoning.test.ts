import { describe, expect, it } from 'vitest';

import { stripEnglishReasoning } from './stripEnglishReasoning';

describe('stripEnglishReasoning', () => {
  it('returns empty string for empty or whitespace input', () => {
    expect(stripEnglishReasoning('')).toBe('');
    expect(stripEnglishReasoning('   ')).toBe('');
    expect(stripEnglishReasoning('\n\n')).toBe('');
  });

  it('keeps lines with Cyrillic (Russian reply)', () => {
    expect(stripEnglishReasoning('Что у вас с ценами?')).toBe('Что у вас с ценами?');
    expect(stripEnglishReasoning('Конкуренты на 15% дешевле возят.')).toBe(
      'Конкуренты на 15% дешевле возят.',
    );
  });

  it('strips long English reasoning blocks', () => {
    const input =
      "I've crafted the initial phrase, adhering precisely to the provided text.\n\nчто конкурента на 15% дешевле возят?";
    expect(stripEnglishReasoning(input)).toBe('что конкурента на 15% дешевле возят?');
  });

  it('keeps short non-Cyrillic fragments (digits, symbols, abbreviations)', () => {
    expect(stripEnglishReasoning('15')).toBe('15');
    expect(stripEnglishReasoning('%')).toBe('%');
    expect(stripEnglishReasoning('FMCG')).toBe('FMCG');
    expect(stripEnglishReasoning('Скидка 15% на FMCG')).toBe('Скидка 15% на FMCG');
  });

  it('strips only long lines without Cyrillic', () => {
    const input = 'Short.\n\nI have written a long English reasoning sentence here.\n\nПривет.';
    expect(stripEnglishReasoning(input)).toBe('Short. Привет.');
  });

  it('joins kept lines with space', () => {
    const input = 'Первая строка.\nВторая строка.';
    expect(stripEnglishReasoning(input)).toBe('Первая строка. Вторая строка.');
  });
});

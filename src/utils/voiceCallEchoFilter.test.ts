import { describe, expect, it } from 'vitest';

import { dropLikelyEchoUserEntries, isLikelyEcho, normalizeEchoText } from './voiceCallEchoFilter';

describe('voiceCallEchoFilter', () => {
  it('normalizeEchoText lowercases, replaces ё, and strips punctuation', () => {
    expect(normalizeEchoText('Ёжик, Привет!!!')).toBe('ежик привет');
    expect(normalizeEchoText('  Привет\tмир\n')).toBe('привет мир');
  });

  it('isLikelyEcho returns false for too short inputs', () => {
    expect(isLikelyEcho('привет', 'привет')).toBe(false);
    expect(isLikelyEcho('hello hello', 'hello hello')).toBe(false);
  });

  it('isLikelyEcho matches identical text after normalization', () => {
    const ai = 'Что, аргументы закончились? Камера всё еще пишет, вы в курсе?';
    const user = 'что аргументы закончились камера все еще пишет вы в курсе';
    expect(isLikelyEcho(user, ai)).toBe(true);
  });

  it('isLikelyEcho matches near-substring with similar length', () => {
    const ai = 'Ну же, не молчите, мы в прямом эфире. Зрители ждут оправданий.';
    const user = 'Мы в прямом эфире зрители ждут оправданий';
    expect(isLikelyEcho(user, ai)).toBe(true);
  });

  it('dropLikelyEchoUserEntries removes user echo next to AI', () => {
    const cleaned = dropLikelyEchoUserEntries([
      { role: 'ai', text: 'Добрый день. Представьтесь, пожалуйста.' },
      { role: 'user', text: 'добрый день представьтесь пожалуйста' }, // echo
      { role: 'user', text: 'Меня зовут Алексей.' },
      { role: 'ai', text: 'Почему вы молчите?' },
    ]);

    expect(cleaned).toEqual([
      { role: 'ai', text: 'Добрый день. Представьтесь, пожалуйста.' },
      { role: 'user', text: 'Меня зовут Алексей.' },
      { role: 'ai', text: 'Почему вы молчите?' },
    ]);
  });

  it('dropLikelyEchoUserEntries checks both prev and next AI neighbors', () => {
    const cleaned = dropLikelyEchoUserEntries([
      { role: 'user', text: 'Это не эхо.' },
      { role: 'user', text: 'ну же не молчите мы в прямом эфире зрители ждут оправданий' }, // echo (next AI)
      { role: 'ai', text: 'Ну же, не молчите, мы в прямом эфире. Зрители ждут оправданий.' },
    ]);

    expect(cleaned).toEqual([
      { role: 'user', text: 'Это не эхо.' },
      { role: 'ai', text: 'Ну же, не молчите, мы в прямом эфире. Зрители ждут оправданий.' },
    ]);
  });
});


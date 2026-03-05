import { describe, expect, it } from 'vitest';

import { HARD_NEGOTIATIONS_PRESETS } from './index';

const THINKING_MODEL = 'gemini-2.5-pro';
const FAST_MODEL = 'gemini-2.5-flash';

describe('initialAgents', () => {
  describe('HARD_NEGOTIATIONS_PRESETS', () => {
    it('все пресеты используют быструю модель (gemini-2.5-flash), без режима размышлений', () => {
      for (const preset of HARD_NEGOTIATIONS_PRESETS) {
        expect(
          preset.model,
          `Пресет "${preset.title}" должен использовать быструю модель, а не thinking-модель`,
        ).toBe(FAST_MODEL);
      }
    });

    it('ни один пресет не использует thinking-модель gemini-2.5-pro', () => {
      const proPresets = HARD_NEGOTIATIONS_PRESETS.filter((p) => p.model === THINKING_MODEL);
      expect(
        proPresets,
        'Пресеты «Жесткие переговоры» не должны использовать gemini-2.5-pro (медленные ответы с раздумыванием)',
      ).toHaveLength(0);
    });

    it('у каждого пресета есть openingMessage для мгновенного ответа при открытии', () => {
      for (const preset of HARD_NEGOTIATIONS_PRESETS) {
        expect(
          preset.openingMessage,
          `Пресет "${preset.title}" должен иметь openingMessage`,
        ).toBeDefined();
        expect(typeof preset.openingMessage).toBe('string');
        expect((preset.openingMessage as string).length).toBeGreaterThan(0);
      }
    });
  });
});

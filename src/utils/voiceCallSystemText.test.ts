import { describe, expect, it } from 'vitest';

import { cleanVoiceAiText, sanitizeVoiceSystemInstruction } from './voiceCallSystemText';

describe('voiceCallSystemText', () => {
  it('removes planner meta tags from AI text', () => {
    const input =
      'Так, стоп. Ответьте прямо. [weaknessCode: direct_answer_missing] [responseMode: press_for_direct_answer]';

    expect(cleanVoiceAiText(input, { stripEnglishReasoning: false })).toBe(
      'Так, стоп. Ответьте прямо.',
    );
  });

  it('removes mixed score and planner tags from AI text', () => {
    const input =
      'Ну допустим... [CHECKPOINT: VALUE] [SCORE: +5] [CURRENT_SCORE: 12] [responseMode: answer_then_probe]';

    expect(cleanVoiceAiText(input, { stripEnglishReasoning: false })).toBe('Ну допустим...');
  });

  it('strips planner tag instructions from voice system prompt', () => {
    const prompt = [
      'Первая реплика: Представься как журналистка-блогер канала на VK Видео.',
      '',
      'Техническое требование: В САМЫЙ КОНЕЦ своей реплики добавляй служебные теги для UI.',
      'Пример: [weaknessCode: direct_answer_missing, responseMode: press_for_direct_answer]',
      'Это техническая информация, ты не должен её произносить.',
    ].join('\n');

    const sanitized = sanitizeVoiceSystemInstruction(prompt);

    expect(sanitized).toContain(
      'Первая реплика: Представься как журналистка-блогер канала на VK Видео.',
    );
    expect(sanitized).not.toContain('weaknessCode');
    expect(sanitized).not.toContain('responseMode');
    expect(sanitized).not.toContain('служебные теги');
  });
});

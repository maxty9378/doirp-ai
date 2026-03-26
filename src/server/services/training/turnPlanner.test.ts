import { describe, expect, it } from 'vitest';

import { planTrainingTurn } from './turnPlanner';

const knowledgeEntries = [
  {
    attackMyth:
      'Как атаковать: Вы говорите про Zero, но там аспартам и ацесульфам. Это подмена сахара химией.',
    createdAt: new Date(),
    id: 'k1',
    officialUsp:
      'Официальное УТП: линейка Zero снижает калорийность и помогает сократить потребление сахара.',
    productIngredient: 'Fresh Bar Zero / подсластители',
    scenarioId: 'scenario',
    updatedAt: new Date(),
  },
  {
    attackMyth:
      'Как атаковать: В Tornado слишком много кофеина, и потребитель получает ударную дозу стимулятора.',
    createdAt: new Date(),
    id: 'k2',
    officialUsp:
      'Официальное УТП: напиток соответствует нормам по кофеину и рассчитан на взрослую аудиторию.',
    productIngredient: 'Tornado Energy / кофеин',
    scenarioId: 'scenario',
    updatedAt: new Date(),
  },
] as const;

describe('planTrainingTurn', () => {
  it('selects the most relevant knowledge and keeps the current interview line', () => {
    const result = planTrainingTurn({
      knowledgeEntries: [...knowledgeEntries],
      transcript: [
        { role: 'ai', text: 'Вы называете это честной коммуникацией. Тогда что у вас с Zero и аспартамом?' },
        {
          role: 'user',
          text: 'В линейке Zero нет сахара, мы используем подсластители и держим калорийность ниже.',
        },
      ],
    });

    expect(result.currentTopic).toContain('Zero');
    expect(result.relevantKnowledgeIds).toEqual(['k1']);
    expect(result.reasoning.responseGap).toBe('partial');
    expect(result.responseMode).toBe('answer_then_probe');
  });

  it('avoids repeating the same myth and escalates when the answer is evasive', () => {
    const result = planTrainingTurn({
      knowledgeEntries: [...knowledgeEntries],
      previousState: {
        currentTopic: 'Fresh Bar Zero / подсластители',
        evidenceUsed: ['k1'],
        lastKnowledgeIds: ['k1'],
        lastUserClaim: 'Мы уже всё объяснили.',
        openLoops: ['Что у вас с аспартамом?'],
        pressureLevel: 2,
      },
      transcript: [
        { role: 'ai', text: 'Тогда ответьте прямо: почему вы считаете аспартам нормой?' },
        { role: 'user', text: 'Ну это, как бы, мы уже отвечали.' },
      ],
    });

    expect(result.reasoning.responseGap).toBe('evasive');
    expect(result.pressureLevel).toBe(3);
    expect(result.responseMode).toBe('press_for_direct_answer');
    expect(result.relevantKnowledgeIds[0]).toBe('k1');
  });
});

import { describe, expect, it } from 'vitest';

import {
  buildFallbackVoiceCallTurnPlan,
  type VoiceCallPlannerPlan,
  type VoiceCallPlannerState,
} from './voiceCallTurnPlannerFallback';

describe('buildFallbackVoiceCallTurnPlan', () => {
  it('keeps the previous topic and knowledge but avoids the static generic fallback', () => {
    const previousState: VoiceCallPlannerState = {
      currentTopic: 'Сахар',
      evidenceUsed: ['sugar-1'],
      lastKnowledgeIds: ['sugar-1'],
      lastUserClaim: 'Сахара там немного',
      openLoops: ['Сколько сахара в банке?'],
      pressureLevel: 2,
    };

    const previousPlan: VoiceCallPlannerPlan = {
      currentTopic: 'Сахар',
      lastUserClaim: 'Сахара там немного',
      openLoops: ['Сколько сахара в банке?'],
      pressureLevel: 2,
      reasoning: {
        factualStrength: 'low',
        responseGap: 'partial',
        userTone: 'neutral',
        weaknessCode: 'partial_answer',
      },
      relevantKnowledge: [
        {
          attackMyth: 'В банке много сахара.',
          id: 'sugar-1',
          officialUsp: 'Безопасная доза не подтверждена.',
          productIngredient: 'Сахар',
        },
      ],
      relevantKnowledgeIds: ['sugar-1'],
      responseMode: 'answer_then_probe',
      state: previousState,
    };

    const plan = buildFallbackVoiceCallTurnPlan({
      previousPlan,
      previousState,
      transcript: [
        { role: 'ai', text: 'Сколько там сахара, ответьте прямо?' },
        { role: 'user', text: 'Немного.' },
      ],
    });

    expect(plan.currentTopic).toBe('Сахар');
    expect(plan.relevantKnowledgeIds).toEqual(['sugar-1']);
    expect(plan.reasoning.weaknessCode).toBe('direct_answer_missing');
    expect(plan.responseMode).toBe('press_for_direct_answer');
    expect(plan.openLoops[0]).toContain('Сколько там сахара');
  });

  it('reduces pressure when the user answers with concrete facts', () => {
    const previousState: VoiceCallPlannerState = {
      currentTopic: 'Кофеин',
      evidenceUsed: ['caffeine-1'],
      lastKnowledgeIds: ['caffeine-1'],
      lastUserClaim: 'Там 80 мг кофеина',
      openLoops: ['Сколько кофеина в банке?'],
      pressureLevel: 3,
    };

    const plan = buildFallbackVoiceCallTurnPlan({
      previousState,
      transcript: [
        { role: 'ai', text: 'Сколько кофеина в банке?' },
        { role: 'user', text: '80 мг на банку, это написано на составе.' },
      ],
    });

    expect(plan.reasoning.factualStrength).toBe('high');
    expect(plan.reasoning.responseGap).toBe('answered');
    expect(plan.responseMode).toBe('acknowledge_then_pressure');
    expect(plan.pressureLevel).toBe(2);
    expect(plan.state.lastUserClaim).toBe('80 мг на банку, это написано на составе.');
  });
});

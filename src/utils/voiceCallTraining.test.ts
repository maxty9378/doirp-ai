import { describe, expect, it } from 'vitest';

import {
  applyTrainingProgress,
  buildTrainingProgressInstruction,
  normalizeTrainingProgressArgs,
} from './voiceCallTraining';

describe('voiceCallTraining', () => {
  it('normalizes tool args and filters unknown checkpoints', () => {
    expect(
      normalizeTrainingProgressArgs(
        {
          checkpointIds: [' VALUE ', 'unknown', 'VALUE'],
          notes: '  хорошо отработал  ',
          scoreDelta: '12',
          scoreTotal: '-99',
        },
        ['VALUE', 'NEXT_STEP'],
      ),
    ).toEqual({
      checkpointIds: ['VALUE'],
      notes: 'хорошо отработал',
      scoreDelta: 10,
      scoreTotal: -50,
    });
  });

  it('applies score delta and closes checkpoints', () => {
    const progress = applyTrainingProgress({
      checkpoints: [
        { done: false, id: 'VALUE', label: 'Value' },
        { done: false, id: 'NEXT_STEP', label: 'Next step' },
      ],
      enableCheckpoints: true,
      enableScoring: true,
      report: {
        checkpointIds: ['NEXT_STEP'],
        scoreDelta: 6,
      },
      score: 4,
    });

    expect(progress.nextScore).toBe(10);
    expect(progress.scoreChanged).toBe(true);
    expect(progress.nextCheckpoints).toEqual([
      { done: false, id: 'VALUE', label: 'Value' },
      { done: true, id: 'NEXT_STEP', label: 'Next step' },
    ]);
  });

  it('builds instruction that bans score tags and points to the tool', () => {
    const instruction = buildTrainingProgressInstruction({
      checkpointIds: ['VALUE', 'NEXT_STEP'],
      enableCheckpoints: true,
      enableScoring: true,
      toolName: 'report_training_turn_progress',
    });

    expect(instruction).toContain('report_training_turn_progress');
    expect(instruction).toContain('[SCORE]');
    expect(instruction).toContain('[CURRENT_SCORE]');
    expect(instruction).toContain('[CHECKPOINT]');
    expect(instruction).toContain('VALUE, NEXT_STEP');
  });
});

export const DEFAULT_TRAINING_PROGRESS_TOOL_NAME = 'report_training_turn_progress';

const DEFAULT_SCORE_MIN = -50;
const DEFAULT_SCORE_MAX = 50;
const DEFAULT_SCORE_DELTA_MIN = -10;
const DEFAULT_SCORE_DELTA_MAX = 10;

interface VoiceCallCheckpointState {
  done: boolean;
  id: string;
  label: string;
}

export interface TrainingProgressToolArgs {
  checkpointIds: string[];
  notes?: string;
  scoreDelta?: number;
  scoreTotal?: number;
}

interface BuildTrainingProgressInstructionOptions {
  checkpointIds?: string[];
  enableCheckpoints: boolean;
  enableScoring: boolean;
  toolName?: string | null;
}

interface ApplyTrainingProgressOptions {
  checkpoints: VoiceCallCheckpointState[];
  enableCheckpoints: boolean;
  enableScoring: boolean;
  report: TrainingProgressToolArgs;
  score: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const toRoundedNumber = (value: unknown) => {
  const numeric =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number.parseFloat(value.trim())
        : Number.NaN;

  if (!Number.isFinite(numeric)) return undefined;

  return Math.round(numeric);
};

export const normalizeTrainingProgressArgs = (
  value: unknown,
  allowedCheckpointIds?: string[],
): TrainingProgressToolArgs => {
  const record = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const allowedCheckpointMap = new Map(
    (allowedCheckpointIds ?? [])
      .map((checkpointId) => checkpointId.trim())
      .filter(Boolean)
      .map((checkpointId) => [checkpointId.toLowerCase(), checkpointId]),
  );

  const rawCheckpointIds = Array.isArray(record.checkpointIds) ? record.checkpointIds : [];
  const checkpointIds = Array.from(
    new Set(
      rawCheckpointIds
        .map((item) => (typeof item === 'string' ? item.trim() : ''))
        .filter(Boolean)
        .map((checkpointId) => {
          if (allowedCheckpointMap.size === 0) return checkpointId;

          return allowedCheckpointMap.get(checkpointId.toLowerCase()) ?? '';
        })
        .filter(Boolean),
    ),
  );

  const scoreDeltaRaw = toRoundedNumber(record.scoreDelta);
  const scoreTotalRaw = toRoundedNumber(record.scoreTotal);
  const notes =
    typeof record.notes === 'string' && record.notes.trim().length > 0
      ? record.notes.trim()
      : undefined;

  return {
    checkpointIds,
    ...(scoreDeltaRaw !== undefined
      ? {
          scoreDelta: clamp(scoreDeltaRaw, DEFAULT_SCORE_DELTA_MIN, DEFAULT_SCORE_DELTA_MAX),
        }
      : {}),
    ...(scoreTotalRaw !== undefined
      ? {
          scoreTotal: clamp(scoreTotalRaw, DEFAULT_SCORE_MIN, DEFAULT_SCORE_MAX),
        }
      : {}),
    ...(notes ? { notes } : {}),
  };
};

export const buildTrainingProgressInstruction = ({
  enableCheckpoints,
  enableScoring,
  checkpointIds,
  toolName,
}: BuildTrainingProgressInstructionOptions) => {
  if (!enableCheckpoints && !enableScoring) return '';

  const resolvedToolName = toolName?.trim() || DEFAULT_TRAINING_PROGRESS_TOOL_NAME;
  const checkpointLine =
    enableCheckpoints && checkpointIds && checkpointIds.length > 0
      ? `- checkpointIds: массив завершённых checkpoint ID. Используй только значения из этого списка: ${checkpointIds.join(', ')}.`
      : '- checkpointIds: передавай пустой массив, если в этом ходе не был закрыт новый checkpoint.';
  const scoreLine = enableScoring
    ? [
        '- scoreDelta: целое число от -10 до 10 за текущий ход. Если ход нейтральный, передай 0.',
        '- scoreTotal: текущий накопительный счёт после этого хода.',
      ].join('\n')
    : '- scoreDelta: передавай 0, а scoreTotal не передавай.';

  return [
    '[ТЕХНИЧЕСКАЯ ДИСЦИПЛИНА ТРЕНАЖЁРА]',
    `- После каждой своей завершённой реплики сначала скажи живой ответ, а затем сразу вызови инструмент ${resolvedToolName}.`,
    '- Не вставляй в обычный текст теги [SCORE], [CURRENT_SCORE], [CHECKPOINT] и любые другие служебные поля.',
    scoreLine,
    checkpointLine,
    '- notes: одно короткое служебное пояснение на русском, не для озвучивания.',
  ].join('\n');
};

export const applyTrainingProgress = ({
  score,
  report,
  checkpoints,
  enableCheckpoints,
  enableScoring,
}: ApplyTrainingProgressOptions) => {
  const nextScore = (() => {
    if (!enableScoring) return score;
    if (typeof report.scoreTotal === 'number') {
      return clamp(report.scoreTotal, DEFAULT_SCORE_MIN, DEFAULT_SCORE_MAX);
    }
    if (typeof report.scoreDelta === 'number') {
      return clamp(score + report.scoreDelta, DEFAULT_SCORE_MIN, DEFAULT_SCORE_MAX);
    }

    return score;
  })();

  if (!enableCheckpoints || report.checkpointIds.length === 0) {
    return {
      nextCheckpoints: checkpoints,
      nextScore,
      scoreChanged: nextScore !== score,
    };
  }

  const completedIds = new Set(
    report.checkpointIds.map((checkpointId) => checkpointId.toLowerCase()),
  );
  const nextCheckpoints = checkpoints.map((checkpoint) =>
    completedIds.has(checkpoint.id.toLowerCase()) ? { ...checkpoint, done: true } : checkpoint,
  );

  return {
    nextCheckpoints,
    nextScore,
    scoreChanged: nextScore !== score,
  };
};

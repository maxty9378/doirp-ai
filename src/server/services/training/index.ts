import {
  trainingKnowledgeEntries,
  type TrainingKnowledgeEntryItem,
  type TrainingScenarioItem,
  trainingScenarios,
} from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';

import {
  DEFAULT_VOICE_CALL_AGENT_ID,
  GFD_GOOGLE_LIVE_VOICE_AGENT_ID,
  resolveVoiceCallScenarioKey,
} from '@/const/voiceCall';
import { serverDB } from '@/database/server';

export interface TrainingScenarioWithKnowledge {
  knowledgeEntries: TrainingKnowledgeEntryItem[];
  scenario: TrainingScenarioItem;
}

const buildGoogleLiveScenarioVariant = (scenario: TrainingScenarioItem): TrainingScenarioItem => ({
  ...scenario,
  description:
    'Отдельная версия стресс-интервью на официальном Google Gemini Live API с live-расшифровкой речи.',
  enableCheckpoints: false,
  enableScoring: false,
  key: GFD_GOOGLE_LIVE_VOICE_AGENT_ID,
  scoreDisplayLabel: null,
  scoreLevelLabels: null,
  title: 'GFD: Google Live + расшифровка',
});

const withBuiltInScenarioVariants = (scenarios: TrainingScenarioItem[]): TrainingScenarioItem[] => {
  if (scenarios.some((scenario) => scenario.key === GFD_GOOGLE_LIVE_VOICE_AGENT_ID))
    return scenarios;

  const baseIndex = scenarios.findIndex((scenario) => scenario.key === DEFAULT_VOICE_CALL_AGENT_ID);
  if (baseIndex === -1) return scenarios;

  const next = [...scenarios];
  next.splice(baseIndex + 1, 0, buildGoogleLiveScenarioVariant(scenarios[baseIndex]));

  return next;
};

export const listTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  const scenarios = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.isActive, true))
    .orderBy(trainingScenarios.createdAt);

  return withBuiltInScenarioVariants(scenarios);
};

export const listAllTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  const scenarios = await serverDB
    .select()
    .from(trainingScenarios)
    .orderBy(trainingScenarios.createdAt);

  return withBuiltInScenarioVariants(scenarios);
};

export const getTrainingScenarioByKey = async (
  key: string,
): Promise<TrainingScenarioItem | null> => {
  const resolvedKey = resolveVoiceCallScenarioKey(key);
  const [scenario] = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.key, resolvedKey))
    .limit(1);

  if (!scenario) return null;

  if (key === resolvedKey) return scenario;

  if (key === GFD_GOOGLE_LIVE_VOICE_AGENT_ID) return buildGoogleLiveScenarioVariant(scenario);

  return scenario;
};

export const getTrainingScenarioWithKnowledge = async (
  key: string,
): Promise<TrainingScenarioWithKnowledge | null> => {
  const scenario = await getTrainingScenarioByKey(key);
  if (!scenario) return null;

  const knowledgeEntries = await serverDB
    .select()
    .from(trainingKnowledgeEntries)
    .where(eq(trainingKnowledgeEntries.scenarioId, scenario.id))
    .orderBy(trainingKnowledgeEntries.createdAt);

  return { knowledgeEntries, scenario };
};

import {
  trainingKnowledgeEntries,
  type TrainingKnowledgeEntryItem,
  type TrainingScenarioItem,
  trainingScenarios,
} from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';

import { serverDB } from '@/database/server';

export interface TrainingScenarioWithKnowledge {
  knowledgeEntries: TrainingKnowledgeEntryItem[];
  scenario: TrainingScenarioItem;
}

export const listTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  return serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.isActive, true))
    .orderBy(trainingScenarios.createdAt);
};

export const listAllTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  return serverDB.select().from(trainingScenarios).orderBy(trainingScenarios.createdAt);
};

export const getTrainingScenarioByKey = async (
  key: string,
): Promise<TrainingScenarioItem | null> => {
  const [scenario] = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.key, key))
    .limit(1);

  return scenario ?? null;
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

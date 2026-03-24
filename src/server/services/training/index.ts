import { eq } from 'drizzle-orm';

import {
  trainingKnowledgeEntries,
  trainingScenarios,
  type TrainingKnowledgeEntryItem,
  type TrainingScenarioItem,
} from '@lobechat/database/schemas';

import {
  GFD_STRESS_TRAINING_KEY,
  GFD_STRESS_TRAINING_KNOWLEDGE,
  GFD_STRESS_TRAINING_SCENARIO,
} from '@/config/training/gfdStressScenario';
import { serverDB } from '@/database/server';

export interface TrainingScenarioWithKnowledge {
  knowledgeEntries: TrainingKnowledgeEntryItem[];
  scenario: TrainingScenarioItem;
}

const insertScenarioSeed = async (): Promise<TrainingScenarioItem> => {
  const [created] = await serverDB
    .insert(trainingScenarios)
    .values({
      assistantLabel: GFD_STRESS_TRAINING_SCENARIO.assistantLabel,
      checkpointIds: GFD_STRESS_TRAINING_SCENARIO.checkpointIds,
      contextWindow: GFD_STRESS_TRAINING_SCENARIO.contextWindow,
      description: GFD_STRESS_TRAINING_SCENARIO.description,
      enableCheckpoints: GFD_STRESS_TRAINING_SCENARIO.enableCheckpoints,
      enableScoring: GFD_STRESS_TRAINING_SCENARIO.enableScoring,
      goals: GFD_STRESS_TRAINING_SCENARIO.goals,
      isActive: GFD_STRESS_TRAINING_SCENARIO.isActive,
      key: GFD_STRESS_TRAINING_SCENARIO.key,
      legend: GFD_STRESS_TRAINING_SCENARIO.legend,
      showLegend: GFD_STRESS_TRAINING_SCENARIO.showLegend,
      showIntroDialog: GFD_STRESS_TRAINING_SCENARIO.showIntroDialog ?? true,
      sessionDurationMs: GFD_STRESS_TRAINING_SCENARIO.sessionDurationMs ?? GFD_STRESS_TRAINING_SCENARIO.silenceHardHangupMs,
      silenceHardHangupMs: GFD_STRESS_TRAINING_SCENARIO.silenceHardHangupMs,
      silenceNudgeAfterMs: GFD_STRESS_TRAINING_SCENARIO.silenceNudgeAfterMs,
      silenceNudgeCooldownMs: GFD_STRESS_TRAINING_SCENARIO.silenceNudgeCooldownMs,
      silenceNudgePhrases: GFD_STRESS_TRAINING_SCENARIO.silenceNudgePhrases,
      roundEndingPrompt: GFD_STRESS_TRAINING_SCENARIO.roundEndingPrompt ?? null,
      silenceNudgeTemplate: GFD_STRESS_TRAINING_SCENARIO.silenceNudgeTemplate ?? null,
      shortAnswerNudge: GFD_STRESS_TRAINING_SCENARIO.shortAnswerNudge ?? null,
      quietSpeakerNudge: GFD_STRESS_TRAINING_SCENARIO.quietSpeakerNudge ?? null,
      autoSuccessPrompt: GFD_STRESS_TRAINING_SCENARIO.autoSuccessPrompt ?? null,
      analyzePrompt: GFD_STRESS_TRAINING_SCENARIO.analyzePrompt ?? null,
      debriefPrompt: GFD_STRESS_TRAINING_SCENARIO.debriefPrompt ?? null,
      openingInstruction: GFD_STRESS_TRAINING_SCENARIO.openingInstruction ?? null,
      scoreDisplayLabel: GFD_STRESS_TRAINING_SCENARIO.scoreDisplayLabel ?? null,
      scoreLevelLabels: GFD_STRESS_TRAINING_SCENARIO.scoreLevelLabels ?? null,
      systemPrompt: GFD_STRESS_TRAINING_SCENARIO.systemPrompt,
      title: GFD_STRESS_TRAINING_SCENARIO.title,
      userLabel: GFD_STRESS_TRAINING_SCENARIO.userLabel,
      userRole: GFD_STRESS_TRAINING_SCENARIO.userRole,
      voiceName: GFD_STRESS_TRAINING_SCENARIO.voiceName,
    })
    .returning();

  if (!created) {
    throw new Error('Failed to seed training scenario');
  }

  if (GFD_STRESS_TRAINING_KNOWLEDGE.length > 0) {
    await serverDB.insert(trainingKnowledgeEntries).values(
      GFD_STRESS_TRAINING_KNOWLEDGE.map((entry) => ({
        attackMyth: entry.attackMyth,
        officialUsp: entry.officialUsp,
        productIngredient: entry.productIngredient,
        scenarioId: created.id,
      })),
    );
  }

  return created;
};

export const ensureTrainingScenarioSeed = async (
  key: string,
): Promise<TrainingScenarioItem | null> => {
  if (key !== GFD_STRESS_TRAINING_KEY) return null;

  const [existing] = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.key, key))
    .limit(1);

  if (existing) return existing;
  return insertScenarioSeed();
};

export const listTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  await ensureTrainingScenarioSeed(GFD_STRESS_TRAINING_KEY);

  return serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.isActive, true))
    .orderBy(trainingScenarios.createdAt);
};

export const listAllTrainingScenarios = async (): Promise<TrainingScenarioItem[]> => {
  await ensureTrainingScenarioSeed(GFD_STRESS_TRAINING_KEY);

  return serverDB
    .select()
    .from(trainingScenarios)
    .orderBy(trainingScenarios.createdAt);
};

export const getTrainingScenarioByKey = async (
  key: string,
): Promise<TrainingScenarioItem | null> => {
  const seeded = await ensureTrainingScenarioSeed(key);
  if (seeded) return seeded;

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

export const buildTrainingKnowledgeContext = (
  entries: TrainingKnowledgeEntryItem[],
): string | null => {
  if (!entries.length) return null;

  const lines = entries.map(
    (entry, index) =>
      `${index + 1}. ${entry.productIngredient}\n` +
      `   УТП: ${entry.officialUsp}\n` +
      `   Миф для атаки: ${entry.attackMyth}`,
  );

  return ['База знаний для провокаций:', ...lines].join('\n');
};

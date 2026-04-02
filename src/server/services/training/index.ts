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
    'РћС‚РґРµР»СЊРЅР°СЏ РІРµСЂСЃРёСЏ СЃС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ РЅР° РѕС„РёС†РёР°Р»СЊРЅРѕРј Google Gemini Live API СЃ live-СЂР°СЃС€РёС„СЂРѕРІРєРѕР№ СЂРµС‡Рё.',
  key: GFD_GOOGLE_LIVE_VOICE_AGENT_ID,
  title: 'GFD: Google Live + СЂР°СЃС€РёС„СЂРѕРІРєР°',
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
  // 1. РЎРЅР°С‡Р°Р»Р° РёС‰РµРј РїРѕ С‚РѕС‡РЅРѕРјСѓ РєР»СЋС‡Сѓ РІ Р‘Р”
  // Р•СЃР»Рё РїРѕР»СЊР·РѕРІР°С‚РµР»СЊ РёР·РјРµРЅРёР» РєРѕРЅРєСЂРµС‚РЅСѓСЋ РІРµСЂСЃРёСЋ (РЅР°РїСЂРёРјРµСЂ, -google-live),
  // РјС‹ РґРѕР»Р¶РЅС‹ РІРµСЂРЅСѓС‚СЊ РёРјРµРЅРЅРѕ РµС‘.
  const [exactScenario] = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.key, key))
    .limit(1);

  if (exactScenario) return exactScenario;

  // 2. Р•СЃР»Рё РїРѕ С‚РѕС‡РЅРѕРјСѓ РєР»СЋС‡Сѓ РЅРµ РЅР°С€Р»Рё, РїСЂРѕР±СѓРµРј СЂР°Р·СЂРµС€РёС‚СЊ РєР»СЋС‡ (fallback)
  const resolvedKey = resolveVoiceCallScenarioKey(key);

  // Р•СЃР»Рё СЌС‚Рѕ СѓР¶Рµ Р±С‹Р» СЂР°Р·СЂРµС€РµРЅРЅС‹Р№ РєР»СЋС‡ Рё РјС‹ РµРіРѕ РЅРµ РЅР°С€Р»Рё РІС‹С€Рµ, Р·РЅР°С‡РёС‚ РµРіРѕ РЅРµС‚ РІ Р‘Р”
  if (key === resolvedKey) return null;

  const [baseScenario] = await serverDB
    .select()
    .from(trainingScenarios)
    .where(eq(trainingScenarios.key, resolvedKey))
    .limit(1);

  if (!baseScenario) return null;

  // 3. Р•СЃР»Рё РЅР°С€Р»Рё Р±Р°Р·РѕРІС‹Р№ СЃС†РµРЅР°СЂРёР№ РґР»СЏ СЃРїРµС†РёР°Р»СЊРЅРѕРіРѕ РєР»СЋС‡Р° (РІР°СЂРёР°РЅС‚Р°), РІРѕР·РІСЂР°С‰Р°РµРј РІР°СЂРёР°РЅС‚
  if (key === GFD_GOOGLE_LIVE_VOICE_AGENT_ID) return buildGoogleLiveScenarioVariant(baseScenario);

  return baseScenario;
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

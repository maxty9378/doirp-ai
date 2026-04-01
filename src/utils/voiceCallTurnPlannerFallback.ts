const MAX_OPEN_LOOPS = 3;

const AGGRESSIVE_PATTERNS = [/\bбред\b/i, /\bложь\b/i, /\bчушь\b/i, /\bвран/i];
const UNCERTAIN_PATTERNS = [/\bнаверное\b/i, /\bможет\b/i, /\bкажется\b/i, /\bвроде\b/i];
const FACTUAL_PATTERNS = [/\d/, /\bмг\b/i, /\bграм\b/i, /\bпроцент\b/i, /\bданн/i, /\bсостав/i];

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('ё', 'е')
    .replaceAll(/[^\p{L}\p{N}\s-]/gu, ' ')
    .replaceAll(/\s+/g, ' ')
    .trim();

const tokenize = (value: string) =>
  normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);

const overlapScore = (left: string[], right: Set<string>) => {
  let score = 0;

  for (const token of left) {
    if (right.has(token)) score += 1;
  }

  return score;
};

const compactSentence = (value: string) =>
  value
    .replaceAll(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .find(Boolean) ?? value.trim();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface VoiceCallPlannerTranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export interface VoiceCallPlannerState {
  currentTopic: string | null;
  evidenceUsed: string[];
  lastKnowledgeIds: string[];
  lastUserClaim: string | null;
  openLoops: string[];
  pressureLevel: number;
}

export interface VoiceCallPlannerKnowledgeItem {
  attackMyth: string;
  id: string;
  officialUsp: string;
  productIngredient: string;
}

export interface VoiceCallPlannerPlan {
  currentTopic: string | null;
  lastUserClaim: string | null;
  openLoops: string[];
  pressureLevel: number;
  reasoning: {
    factualStrength: 'high' | 'low' | 'medium';
    responseGap: 'answered' | 'evasive' | 'partial';
    userTone: 'aggressive' | 'neutral' | 'uncertain';
    weaknessCode:
      | 'direct_answer_missing'
      | 'emotional_defense'
      | 'follow_up_open'
      | 'no_evidence'
      | 'partial_answer';
  };
  relevantKnowledge: VoiceCallPlannerKnowledgeItem[];
  relevantKnowledgeIds: string[];
  responseMode:
    | 'acknowledge_then_pressure'
    | 'answer_then_probe'
    | 'deescalate_then_return'
    | 'press_for_direct_answer';
  state: VoiceCallPlannerState;
}

interface BuildFallbackVoiceCallTurnPlanParams {
  previousPlan?: VoiceCallPlannerPlan | null;
  previousState?: VoiceCallPlannerState | null;
  transcript: VoiceCallPlannerTranscriptEntry[];
}

const inferResponseGap = (lastAiText: string | null, lastUserText: string) => {
  const userTokens = tokenize(lastUserText);
  const hasConcreteAnswer =
    /\d/.test(lastUserText) ||
    FACTUAL_PATTERNS.filter((pattern) => pattern.test(lastUserText)).length >= 2;

  if (hasConcreteAnswer) return 'answered' as const;
  if (userTokens.length <= 3) return 'evasive' as const;
  if (!lastAiText || !lastAiText.includes('?')) return 'answered' as const;

  const aiTokens = new Set(tokenize(lastAiText));
  const overlap = overlapScore(userTokens, aiTokens);

  if (overlap >= 2) return 'answered' as const;
  if (overlap === 1) return 'partial' as const;

  return 'evasive' as const;
};

const inferUserTone = (lastUserText: string) => {
  if (AGGRESSIVE_PATTERNS.some((pattern) => pattern.test(lastUserText)))
    return 'aggressive' as const;
  if (UNCERTAIN_PATTERNS.some((pattern) => pattern.test(lastUserText))) return 'uncertain' as const;

  return 'neutral' as const;
};

const inferFactualStrength = (lastUserText: string) => {
  const normalized = normalizeText(lastUserText);
  const matches = FACTUAL_PATTERNS.filter((pattern) => pattern.test(lastUserText)).length;
  const hasNumber = /\d/.test(lastUserText);
  const hasUnitOrSource = /мг|грам|процент|состав|данн/i.test(normalized);

  if (hasNumber && hasUnitOrSource) return 'high' as const;
  if (matches >= 2) return 'high' as const;
  if (matches === 1) return 'medium' as const;

  return 'low' as const;
};

const buildWeaknessCode = (
  responseGap: VoiceCallPlannerPlan['reasoning']['responseGap'],
  factualStrength: VoiceCallPlannerPlan['reasoning']['factualStrength'],
  userTone: VoiceCallPlannerPlan['reasoning']['userTone'],
) => {
  if (responseGap === 'evasive') return 'direct_answer_missing' as const;
  if (userTone === 'aggressive') return 'emotional_defense' as const;
  if (factualStrength === 'low') return 'no_evidence' as const;
  if (responseGap === 'partial') return 'partial_answer' as const;

  return 'follow_up_open' as const;
};

const inferResponseMode = (
  responseGap: VoiceCallPlannerPlan['reasoning']['responseGap'],
  factualStrength: VoiceCallPlannerPlan['reasoning']['factualStrength'],
  userTone: VoiceCallPlannerPlan['reasoning']['userTone'],
): VoiceCallPlannerPlan['responseMode'] => {
  if (responseGap === 'evasive') return 'press_for_direct_answer';
  if (userTone === 'aggressive') return 'deescalate_then_return';
  if (factualStrength === 'high') return 'acknowledge_then_pressure';

  return 'answer_then_probe';
};

export const buildFallbackVoiceCallTurnPlan = ({
  previousPlan,
  previousState,
  transcript,
}: BuildFallbackVoiceCallTurnPlanParams): VoiceCallPlannerPlan => {
  const recentTurns = transcript.slice(-6);
  const reversedTurns = [...recentTurns].reverse();
  const lastUserText = reversedTurns.find((entry) => entry.role === 'user')?.text?.trim() ?? '';
  const lastAiText = reversedTurns.find((entry) => entry.role === 'ai')?.text?.trim() ?? null;
  const state = previousState ?? previousPlan?.state ?? null;
  const responseGap = inferResponseGap(lastAiText, lastUserText);
  const userTone = inferUserTone(lastUserText);
  const factualStrength = inferFactualStrength(lastUserText);
  const weaknessCode = buildWeaknessCode(responseGap, factualStrength, userTone);
  const responseMode = inferResponseMode(responseGap, factualStrength, userTone);
  const currentTopic = previousPlan?.currentTopic ?? state?.currentTopic ?? null;
  const lastUserClaim = lastUserText || state?.lastUserClaim || null;
  const previousOpenLoops = state?.openLoops ?? previousPlan?.openLoops ?? [];
  const openLoops = Array.from(
    new Set([
      ...(responseGap !== 'answered' && lastAiText ? [compactSentence(lastAiText)] : []),
      ...previousOpenLoops,
      weaknessCode,
    ]),
  ).slice(0, MAX_OPEN_LOOPS);
  const pressureBase = state?.pressureLevel ?? previousPlan?.pressureLevel ?? 1;
  const pressureDelta = responseGap === 'evasive' || userTone === 'aggressive' ? 1 : 0;
  const pressureRelief = factualStrength === 'high' && responseGap === 'answered' ? -1 : 0;
  const pressureLevel = clamp(pressureBase + pressureDelta + pressureRelief, 1, 5);
  const relevantKnowledge = previousPlan?.relevantKnowledge ?? [];
  const relevantKnowledgeIds = previousPlan?.relevantKnowledgeIds ?? [];

  return {
    currentTopic,
    lastUserClaim,
    openLoops,
    pressureLevel,
    reasoning: {
      factualStrength,
      responseGap,
      userTone,
      weaknessCode,
    },
    relevantKnowledge,
    relevantKnowledgeIds,
    responseMode,
    state: {
      currentTopic,
      evidenceUsed: state?.evidenceUsed ?? [],
      lastKnowledgeIds: relevantKnowledgeIds,
      lastUserClaim,
      openLoops,
      pressureLevel,
    },
  };
};

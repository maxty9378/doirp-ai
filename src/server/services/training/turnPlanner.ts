import type { TrainingKnowledgeEntryItem } from '@lobechat/database/schemas';

const MAX_EVIDENCE_HISTORY = 6;
const MAX_OPEN_LOOPS = 3;
const MAX_RELEVANT_KNOWLEDGE = 2;

const STOPWORDS = new Set([
  'а',
  'без',
  'бы',
  'в',
  'во',
  'вот',
  'вы',
  'да',
  'для',
  'до',
  'же',
  'за',
  'и',
  'из',
  'или',
  'их',
  'к',
  'как',
  'ко',
  'ли',
  'мне',
  'мы',
  'на',
  'не',
  'но',
  'ну',
  'о',
  'об',
  'он',
  'она',
  'они',
  'от',
  'по',
  'под',
  'при',
  'про',
  'с',
  'со',
  'так',
  'там',
  'то',
  'тут',
  'у',
  'уж',
  'что',
  'это',
  'эта',
  'этот',
  'эти',
  'я',
]);

const FILLER_PATTERNS = [/\bвроде\b/gi, /\bзнаешь\b/gi, /\bтипа\b/gi, /\bну\b/gi, /\bкак бы\b/gi];

const AGGRESSION_PATTERNS = [
  /\bбред\b/gi,
  /\bврань[её]\b/gi,
  /\bложь\b/gi,
  /\bчушь\b/gi,
  /\bотстань\b/gi,
  /\bзамолчи\b/gi,
  /\bидиот\b/gi,
];

const FACTUAL_PATTERNS = [
  /\bпо данным\b/gi,
  /\bисследован/gi,
  /\bсостав\b/gi,
  /\bнорм/gi,
  /\bмиллиграм/gi,
  /\bграм/gi,
  /\bпроцент/gi,
  /\bзакон/gi,
  /\bакциз/gi,
  /\bпереработк/gi,
  /\bаспартам/gi,
  /\bкофеин/gi,
  /\bтаурин/gi,
];

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
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));

const sanitizeClaim = (value: string) => {
  let text = value.trim();

  for (const pattern of FILLER_PATTERNS) {
    text = text.replace(pattern, ' ');
  }

  return text.replaceAll(/\s+/g, ' ').trim();
};

const compactSentence = (value: string) =>
  value
    .replace(/^как атаковать:\s*/i, '')
    .replace(/^реальный состав для атаки:\s*/i, '')
    .replaceAll(/\s+/g, ' ')
    .trim()
    .split(/(?<=[.!?])\s+/)
    .find(Boolean) ?? value.trim();

const buildKnowledgeBaseKey = (value: string) =>
  normalizeText(value)
    .replaceAll(/\([^)]*\)/g, ' ')
    .replaceAll(
      /\b(флагман|премиум|сильногазированные|напитки|энергетик|энергетики|и|подростки|киберспорт)\b/g,
      ' ',
    )
    .replaceAll(/\s+/g, ' ')
    .trim();

const overlapScore = (tokens: string[], haystack: Set<string>) => {
  let score = 0;

  for (const token of tokens) {
    if (haystack.has(token)) score += 1;
  }

  return score;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export interface TrainingTurnPlannerState {
  currentTopic: string | null;
  evidenceUsed: string[];
  lastKnowledgeIds: string[];
  lastUserClaim: string | null;
  openLoops: string[];
  pressureLevel: number;
}

export interface TrainingTurnTranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export interface PlannedKnowledgeItem {
  attackMyth: string;
  id: string;
  officialUsp: string;
  productIngredient: string;
}

export interface TrainingTurnPlan {
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
  relevantKnowledge: PlannedKnowledgeItem[];
  relevantKnowledgeIds: string[];
  responseMode:
  | 'acknowledge_then_pressure'
  | 'answer_then_probe'
  | 'deescalate_then_return'
  | 'press_for_direct_answer';
  state: TrainingTurnPlannerState;
}

export interface PlanTrainingTurnParams {
  knowledgeEntries: TrainingKnowledgeEntryItem[];
  previousState?: TrainingTurnPlannerState | null;
  transcript: TrainingTurnTranscriptEntry[];
}

const inferResponseGap = (lastAiText: string | null, lastUserText: string) => {
  const cleanedUser = sanitizeClaim(lastUserText);
  const userTokens = tokenize(cleanedUser);

  if (userTokens.length <= 3) return 'evasive' as const;
  if (!lastAiText || !lastAiText.includes('?')) return 'answered' as const;

  const aiTokens = new Set(tokenize(lastAiText));
  const overlap = overlapScore(userTokens, aiTokens);

  if (overlap >= 2) return 'answered' as const;
  if (overlap === 1) return 'partial' as const;

  return 'evasive' as const;
};

const inferTone = (lastUserText: string) => {
  if (AGGRESSION_PATTERNS.some((pattern) => pattern.test(lastUserText))) return 'aggressive' as const;
  if (FILLER_PATTERNS.some((pattern) => pattern.test(lastUserText))) return 'uncertain' as const;

  return 'neutral' as const;
};

const inferFactualStrength = (lastUserText: string) => {
  const matches = FACTUAL_PATTERNS.filter((pattern) => pattern.test(lastUserText)).length;

  if (matches >= 2) return 'high' as const;
  if (matches === 1) return 'medium' as const;

  return 'low' as const;
};

const buildWeaknessCode = (
  responseGap: TrainingTurnPlan['reasoning']['responseGap'],
  factualStrength: TrainingTurnPlan['reasoning']['factualStrength'],
  tone: TrainingTurnPlan['reasoning']['userTone'],
) => {
  if (responseGap === 'evasive') return 'direct_answer_missing' as const;
  if (tone === 'aggressive') return 'emotional_defense' as const;
  if (factualStrength === 'low') return 'no_evidence' as const;
  if (responseGap === 'partial') return 'partial_answer' as const;

  return 'follow_up_open' as const;
};

const inferResponseMode = (
  responseGap: TrainingTurnPlan['reasoning']['responseGap'],
  factualStrength: TrainingTurnPlan['reasoning']['factualStrength'],
  userTone: TrainingTurnPlan['reasoning']['userTone'],
): TrainingTurnPlan['responseMode'] => {
  if (responseGap === 'evasive') return 'press_for_direct_answer';
  if (userTone === 'aggressive') return 'deescalate_then_return';
  if (factualStrength === 'high') return 'acknowledge_then_pressure';

  return 'answer_then_probe';
};

export const planTrainingTurn = ({
  knowledgeEntries,
  previousState,
  transcript,
}: PlanTrainingTurnParams): TrainingTurnPlan => {
  const recentTurns = transcript.slice(-6);
  const reversedTurns = [...recentTurns].reverse();
  const lastUserTurn = reversedTurns.find((entry) => entry.role === 'user') ?? null;
  const lastAiTurn = reversedTurns.find((entry) => entry.role === 'ai') ?? null;
  const lastUserText = lastUserTurn?.text?.trim() ?? '';
  const lastAiText = lastAiTurn?.text?.trim() ?? null;
  const lastUserClaim = lastUserText ? sanitizeClaim(lastUserText) : null;
  const previous = previousState ?? {
    currentTopic: null,
    evidenceUsed: [],
    lastKnowledgeIds: [],
    lastUserClaim: null,
    openLoops: [],
    pressureLevel: 1,
  };

  const responseGap = inferResponseGap(lastAiText, lastUserText);
  const userTone = inferTone(lastUserText);
  const factualStrength = inferFactualStrength(lastUserText);
  const recentContextTokens = tokenize([lastUserText, lastAiText ?? '', previous.currentTopic ?? ''].join(' '));

  const scoredEntries = knowledgeEntries.map((entry) => {
    const docTokens = new Set(
      tokenize(`${entry.productIngredient} ${entry.officialUsp} ${entry.attackMyth}`),
    );
    const ingredientTokens = tokenize(entry.productIngredient);
    const ingredientOverlap = overlapScore(recentContextTokens, new Set(ingredientTokens));
    const generalOverlap = overlapScore(recentContextTokens, docTokens);
    const topicMatch =
      previous.currentTopic &&
        buildKnowledgeBaseKey(entry.productIngredient).includes(buildKnowledgeBaseKey(previous.currentTopic))
        ? 2
        : 0;
    const repeatedPenalty = previous.lastKnowledgeIds.includes(entry.id) ? 4 : 0;
    const duplicateTopicPenalty = previous.evidenceUsed.includes(entry.id) ? 1 : 0;

    return {
      entry,
      score: ingredientOverlap * 5 + generalOverlap * 2 + topicMatch - repeatedPenalty - duplicateTopicPenalty,
      topicKey: buildKnowledgeBaseKey(entry.productIngredient),
    };
  });

  scoredEntries.sort((left, right) => right.score - left.score);

  const relevantEntries: TrainingKnowledgeEntryItem[] = [];
  const seenTopicKeys = new Set<string>();

  for (const item of scoredEntries) {
    if (item.score <= 0 && relevantEntries.length > 0) continue;
    if (seenTopicKeys.has(item.topicKey)) continue;

    relevantEntries.push(item.entry);
    seenTopicKeys.add(item.topicKey);

    if (relevantEntries.length >= MAX_RELEVANT_KNOWLEDGE) break;
  }

  if (!relevantEntries.length && knowledgeEntries.length > 0) {
    const fallback =
      knowledgeEntries.find((entry) =>
        buildKnowledgeBaseKey(entry.productIngredient).includes(buildKnowledgeBaseKey(previous.currentTopic ?? '')),
      ) ?? knowledgeEntries[0];

    if (fallback) relevantEntries.push(fallback);
  }

  const currentTopic = relevantEntries[0]?.productIngredient ?? previous.currentTopic ?? null;
  const weaknessCode = buildWeaknessCode(responseGap, factualStrength, userTone);
  const openLoops = Array.from(
    new Set([
      ...(responseGap !== 'answered' && lastAiText ? [compactSentence(lastAiText)] : []),
      ...previous.openLoops.filter(Boolean).slice(0, MAX_OPEN_LOOPS - 1),
      weaknessCode,
    ]),
  ).slice(0, MAX_OPEN_LOOPS);

  const relevantKnowledgeIds = relevantEntries.map((entry) => entry.id);
  const evidenceUsed = Array.from(new Set([...previous.evidenceUsed, ...relevantKnowledgeIds])).slice(
    -MAX_EVIDENCE_HISTORY,
  );

  const pressureDelta = responseGap === 'evasive' || userTone === 'aggressive' ? 1 : 0;
  const relief = factualStrength === 'high' && responseGap === 'answered' ? -1 : 0;
  const pressureLevel = clamp(previous.pressureLevel + pressureDelta + relief, 1, 5);

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
    relevantKnowledge: relevantEntries.map((entry) => ({
      attackMyth: compactSentence(entry.attackMyth),
      id: entry.id,
      officialUsp: compactSentence(entry.officialUsp),
      productIngredient: entry.productIngredient,
    })),
    relevantKnowledgeIds,
    responseMode: inferResponseMode(responseGap, factualStrength, userTone),
    state: {
      currentTopic,
      evidenceUsed,
      lastKnowledgeIds: relevantKnowledgeIds,
      lastUserClaim,
      openLoops,
      pressureLevel,
    },
  };
};

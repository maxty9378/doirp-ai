import { userCodes, users } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import {
  DEFAULT_VOICE_CALL_AGENT_ID,
  DEFAULT_VOICE_CALL_LIVE_MODEL,
  GEMINI_31_FLASH_LIVE_MODEL,
  GFD_GOOGLE_LIVE_VOICE_AGENT_ID,
  TP_PRICE_VOICE_AGENT_ID,
} from '@/const/voiceCall';
import { serverDB } from '@/database/server';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { getTrainingScenarioWithKnowledge } from '@/server/services/training';

const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
const DEFAULT_SILENCE_HARD_HANGUP_MS = 180_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = [
  '\u0410\u043B\u043B\u043E, \u0432\u044B \u043C\u0435\u043D\u044F \u0432\u043E\u043E\u0431\u0449\u0435 \u0441\u043B\u044B\u0448\u0438\u0442\u0435?',
];
const DEFAULT_LIVE_VOICE = 'Sulafat';
const TRAINING_TURN_TOOL_NAME = 'get_training_turn_context';

const UNAUTHORIZED_ERROR = 'Unauthorized';
const TRAINING_LIMIT_ERROR =
  '\u041B\u0438\u043C\u0438\u0442 \u0437\u0430\u043F\u0443\u0441\u043A\u043E\u0432 \u0442\u0440\u0435\u043D\u0430\u0436\u0451\u0440\u0430 \u0438\u0441\u0447\u0435\u0440\u043F\u0430\u043D. \u041E\u0431\u0440\u0430\u0442\u0438\u0442\u0435\u0441\u044C \u043A \u0430\u0434\u043C\u0438\u043D\u0438\u0441\u0442\u0440\u0430\u0442\u043E\u0440\u0443.';
const TRAINING_NOT_FOUND_ERROR =
  '\u0421\u0446\u0435\u043D\u0430\u0440\u0438\u0439 \u0442\u0440\u0435\u043D\u0430\u0436\u0451\u0440\u0430 \u043D\u0435 \u043D\u0430\u0439\u0434\u0435\u043D \u0432 \u0431\u0430\u0437\u0435 \u0434\u0430\u043D\u043D\u044B\u0445.';
const MANAGER_FALLBACK = '\u041C\u0435\u043D\u0435\u0434\u0436\u0435\u0440';
const USER_CONTEXT_HEADER =
  '\u041A\u043E\u043D\u0442\u0435\u043A\u0441\u0442 \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A\u0430:';
const SPEAKER_NAME_TEMPLATE =
  '- \u0412 \u044D\u0442\u043E\u0439 \u0441\u0435\u0441\u0441\u0438\u0438 \u043D\u0430 \u0432\u043E\u043F\u0440\u043E\u0441\u044B \u043E\u0442\u0432\u0435\u0447\u0430\u0435\u0442 \u0441\u043E\u0442\u0440\u0443\u0434\u043D\u0438\u043A: {{speakerName}}. \u041E\u0431\u0440\u0430\u0449\u0430\u0439\u0441\u044F \u043A \u043D\u0435\u043C\u0443 \u043F\u043E \u044D\u0442\u043E\u043C\u0443 \u0438\u043C\u0435\u043D\u0438.';
const DEFAULT_SPEAKER_CONTEXT =
  '- \u0415\u0441\u043B\u0438 \u043E\u0442\u0434\u0435\u043B\u044C\u043D\u043E\u0435 \u0438\u043C\u044F \u043D\u0435 \u043F\u0435\u0440\u0435\u0434\u0430\u043D\u043E, \u043E\u0431\u0440\u0430\u0449\u0430\u0439\u0441\u044F \u043A \u0441\u043E\u0431\u0435\u0441\u0435\u0434\u043D\u0438\u043A\u0443 \u0432\u0435\u0436\u043B\u0438\u0432\u043E \u043D\u0430 \u00AB\u0432\u044B\u00BB.';
const AI_AGENT_LABEL = '\u0418\u0418-\u0430\u0433\u0435\u043D\u0442';
const YOU_LABEL = '\u0412\u044B';
const STORE_DIRECTOR_LABEL =
  '\u0414\u0438\u0440\u0435\u043A\u0442\u043E\u0440 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430 (\u041C\u0430\u0440\u0438\u043D\u0430 \u0418\u0432\u0430\u043D\u043E\u0432\u043D\u0430)';
const SALES_REP_LABEL =
  '\u0412\u044B (\u0422\u043E\u0440\u0433\u043E\u0432\u044B\u0439 \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0435\u043B\u044C)';
const INTERNAL_SERVER_ERROR = 'Internal server error';

const LIVE_VOICES = new Set([
  'Zephyr',
  'Kore',
  'Orus',
  'Autonoe',
  'Umbriel',
  'Erinome',
  'Laomedeia',
  'Schedar',
  'Achird',
  'Sadachbia',
  'Puck',
  'Fenrir',
  'Aoede',
  'Enceladus',
  'Algieba',
  'Algenib',
  'Achernar',
  'Gacrux',
  'Zubenelgenubi',
  'Sadaltager',
  'Charon',
  'Leda',
  'Callirrhoe',
  'Iapetus',
  'Despina',
  'Rasalgethi',
  'Alnilam',
  'Pulcherrima',
  'Vindemiatrix',
  'Sulafat',
]);

const TP_PRICE_SYSTEM_LINES = [
  '\u0422\u044B \u2014 \u041C\u0430\u0440\u0438\u043D\u0430 \u0418\u0432\u0430\u043D\u043E\u0432\u043D\u0430, \u0434\u0438\u0440\u0435\u043A\u0442\u043E\u0440 \u043C\u0430\u0433\u0430\u0437\u0438\u043D\u0430 \u00AB\u0423 \u0434\u043E\u043C\u0430\u00BB.',
  '\u0418\u0434\u0451\u0442 \u0436\u0438\u0432\u043E\u0439 \u0440\u0430\u0437\u0433\u043E\u0432\u043E\u0440 \u0441 \u043E\u043F\u044B\u0442\u043D\u044B\u043C \u0442\u043E\u0440\u0433\u043E\u0432\u044B\u043C \u043F\u0440\u0435\u0434\u0441\u0442\u0430\u0432\u0438\u0442\u0435\u043B\u0435\u043C.',
  '\u0413\u043E\u0432\u043E\u0440\u0438 \u0442\u043E\u043B\u044C\u043A\u043E \u043E\u0442 \u043B\u0438\u0446\u0430 \u041C\u0430\u0440\u0438\u043D\u044B \u0418\u0432\u0430\u043D\u043E\u0432\u043D\u044B.',
  '\u041E\u0442\u0432\u0435\u0447\u0430\u0439 \u043A\u043E\u0440\u043E\u0442\u043A\u043E: 1-2 \u043F\u0440\u0435\u0434\u043B\u043E\u0436\u0435\u043D\u0438\u044F, \u043F\u043E-\u0440\u0443\u0441\u0441\u043A\u0438, \u0431\u0435\u0437 \u043C\u0435\u0442\u0430\u043A\u043E\u043C\u043C\u0435\u043D\u0442\u0430\u0440\u0438\u0435\u0432.',
  '\u0414\u0435\u0440\u0436\u0438 \u0436\u0451\u0441\u0442\u043A\u0438\u0439 \u0442\u043E\u043D \u0438 \u0434\u0430\u0432\u0438 \u043F\u043E \u0432\u043E\u0437\u0440\u0430\u0436\u0435\u043D\u0438\u044E \u00AB\u0434\u043E\u0440\u043E\u0433\u043E\u00BB, \u043D\u043E \u0440\u0435\u0430\u0433\u0438\u0440\u0443\u0439 \u043D\u0430 \u0441\u0438\u043B\u044C\u043D\u044B\u0435 \u0430\u0440\u0433\u0443\u043C\u0435\u043D\u0442\u044B \u043E \u0434\u043E\u0445\u043E\u0434\u043D\u043E\u0441\u0442\u0438, \u0441\u0435\u0440\u0432\u0438\u0441\u0435 \u0438 \u043C\u0430\u0440\u043A\u0435\u0442\u0438\u043D\u0433\u043E\u0432\u043E\u0439 \u043F\u043E\u0434\u0434\u0435\u0440\u0436\u043A\u0435.',
  '\u041D\u0435 \u0441\u0432\u043E\u0434\u0438 \u043F\u0435\u0440\u0435\u0433\u043E\u0432\u043E\u0440\u044B \u043A \u0441\u043A\u0438\u0434\u043A\u0435 \u043A\u0430\u043A \u043A \u0435\u0434\u0438\u043D\u0441\u0442\u0432\u0435\u043D\u043D\u043E\u043C\u0443 \u0440\u0435\u0448\u0435\u043D\u0438\u044E.',
  '\u041F\u043E\u0441\u043B\u0435 \u043A\u0430\u0436\u0434\u043E\u0439 \u0441\u0432\u043E\u0435\u0439 \u0440\u0435\u043F\u043B\u0438\u043A\u0438 \u0434\u043E\u0431\u0430\u0432\u043B\u044F\u0439 \u0442\u0435\u0445\u043D\u0438\u0447\u0435\u0441\u043A\u0438\u0439 \u0442\u0435\u0433 \u0432 \u043A\u043E\u043D\u0446\u0435: [CURRENT_SCORE: X], \u0433\u0434\u0435 X \u2014 \u043D\u0430\u043A\u043E\u043F\u0438\u0442\u0435\u043B\u044C\u043D\u044B\u0439 \u0441\u0447\u0451\u0442.',
];

const resolveVoiceCallLiveModel = (agentId: string) => {
  if (agentId === GFD_GOOGLE_LIVE_VOICE_AGENT_ID) return GEMINI_31_FLASH_LIVE_MODEL;

  return DEFAULT_VOICE_CALL_LIVE_MODEL;
};

const buildTpPriceVoiceSystem = (preset: {
  goals?: string[];
  scenario_context?: string;
  user_role?: string;
}) => {
  const scenario = preset.scenario_context ?? '';
  const userRole = preset.user_role ?? '';
  const goals = preset.goals?.length ? preset.goals.map((goal) => `- ${goal}`).join('\n') : '';

  return [
    ...TP_PRICE_SYSTEM_LINES,
    '',
    `\u041B\u0435\u0433\u0435\u043D\u0434\u0430:\n${scenario}`,
    '',
    `\u0420\u043E\u043B\u044C \u043F\u043E\u043B\u044C\u0437\u043E\u0432\u0430\u0442\u0435\u043B\u044F:\n${userRole}`,
    '',
    `\u0426\u0435\u043B\u0438 \u0442\u0440\u0435\u043D\u0438\u0440\u043E\u0432\u043A\u0438:\n${goals}`,
  ]
    .filter(Boolean)
    .join('\n');
};

export async function GET(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user?.id) {
      return NextResponse.json({ error: UNAUTHORIZED_ERROR }, { status: 401 });
    }

    const [accessRow] = await serverDB
      .select({
        accountType: userCodes.accountType,
        role: users.role,
        trainingSessionQuota: userCodes.trainingSessionQuota,
        trainingSessionsUsed: userCodes.trainingSessionsUsed,
      })
      .from(users)
      .leftJoin(userCodes, eq(userCodes.userId, users.id))
      .where(eq(users.id, session.user.id))
      .limit(1);

    const isTrainingOnly =
      accessRow?.role === 'training_only' || accessRow?.accountType === 'training-only';
    if (isTrainingOnly) {
      const quota = accessRow?.trainingSessionQuota ?? 0;
      const used = accessRow?.trainingSessionsUsed ?? 0;
      if (quota <= 0 || used >= quota) {
        return NextResponse.json({ error: TRAINING_LIMIT_ERROR }, { status: 403 });
      }
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || DEFAULT_VOICE_CALL_AGENT_ID;
    const speakerName = searchParams.get('speakerName')?.trim() || null;
    const preset = VOICE_CALL_PRESETS[agentId];
    const trainingScenario = await getTrainingScenarioWithKnowledge(agentId).catch((dbError) => {
      console.warn('[voice-call/config] Training scenario from DB failed:', dbError);
      return null;
    });

    if (agentId.startsWith('training-') && !trainingScenario && !preset) {
      return NextResponse.json({ error: TRAINING_NOT_FOUND_ERROR }, { status: 404 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured. Add it in .env or server settings.' },
        { status: 503 },
      );
    }

    const isTpPrice = agentId === TP_PRICE_VOICE_AGENT_ID;
    const sessionUser = (session as any)?.user || {};
    const rawFullName: string | undefined =
      sessionUser.fullName ||
      sessionUser.full_name ||
      sessionUser.name ||
      sessionUser.username ||
      sessionUser.email;
    const userFullName = (rawFullName && String(rawFullName).trim()) || MANAGER_FALLBACK;

    const baseSystemInstruction =
      isTpPrice && preset ? buildTpPriceVoiceSystem(preset) : (preset?.systemRole ?? '');
    const systemInstructionBase = trainingScenario?.scenario.systemPrompt || baseSystemInstruction;

    const userContextLines = [
      USER_CONTEXT_HEADER,
      `- \u041F\u043E\u043B\u043D\u043E\u0435 \u0438\u043C\u044F \u0432 \u0430\u043A\u043A\u0430\u0443\u043D\u0442\u0435: ${userFullName}.`,
      speakerName
        ? SPEAKER_NAME_TEMPLATE.replace('{{speakerName}}', speakerName)
        : DEFAULT_SPEAKER_CONTEXT,
    ];

    const systemInstruction = [systemInstructionBase, userContextLines.join('\n')]
      .filter(Boolean)
      .join('\n\n');

    const requestedVoice = trainingScenario?.scenario.voiceName || DEFAULT_LIVE_VOICE;
    const voiceName = LIVE_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_LIVE_VOICE;

    const assistantLabel =
      trainingScenario?.scenario.assistantLabel ||
      (isTpPrice ? STORE_DIRECTOR_LABEL : AI_AGENT_LABEL);
    const userLabel =
      trainingScenario?.scenario.userLabel || (isTpPrice ? SALES_REP_LABEL : YOU_LABEL);

    const DEV_DEFAULT_VOICE_WS = 'ws://localhost:3011';
    const rawProxyUrl =
      process.env.VOICE_CALL_WS_PROXY_URL?.trim() ||
      (process.env.NODE_ENV === 'development'
        ? process.env.VOICE_CALL_WS_PROXY_DEV?.trim() || DEV_DEFAULT_VOICE_WS
        : null);
    const geminiWsUrl = rawProxyUrl ? rawProxyUrl.replace(/^http/, 'ws') : null;

    const liveModel = resolveVoiceCallLiveModel(agentId);

    const payload: Record<string, unknown> = {
      apiKey,
      ...(geminiWsUrl ? { geminiWsUrl } : {}),
      assistantLabel,
      contextWindow: trainingScenario?.scenario.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      enableCheckpoints: trainingScenario?.scenario.enableCheckpoints ?? isTpPrice,
      enableScoring: trainingScenario?.scenario.enableScoring ?? true,
      enableTurnPlanner: Boolean(trainingScenario),
      sessionDurationMs:
        trainingScenario?.scenario.sessionDurationMs ??
        trainingScenario?.scenario.silenceHardHangupMs ??
        DEFAULT_SILENCE_HARD_HANGUP_MS,
      silenceHardHangupMs:
        trainingScenario?.scenario.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
      silenceNudgeAfterMs:
        trainingScenario?.scenario.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
      silenceNudgeCooldownMs:
        trainingScenario?.scenario.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
      silenceNudgePhrases: trainingScenario?.scenario.silenceNudgePhrases?.length
        ? trainingScenario.scenario.silenceNudgePhrases
        : DEFAULT_SILENCE_NUDGE_PHRASES,
      speakerName: speakerName || undefined,
      liveModel,
      systemInstruction,
      turnPlannerToolName: trainingScenario ? TRAINING_TURN_TOOL_NAME : null,
      userLabel,
      userName: userFullName,
      voiceName,
    };

    if (trainingScenario) {
      payload.title = trainingScenario.scenario.title ?? null;
      payload.legend = trainingScenario.scenario.legend ?? null;
      payload.showLegend = trainingScenario.scenario.showLegend ?? true;
      payload.goals = trainingScenario.scenario.goals ?? [];
      payload.checkpointIds = trainingScenario.scenario.checkpointIds ?? [];
      payload.scoreDisplayLabel = trainingScenario.scenario.scoreDisplayLabel ?? null;
      payload.scoreLevelLabels = trainingScenario.scenario.scoreLevelLabels ?? null;
      payload.openingInstruction = trainingScenario.scenario.openingInstruction ?? null;
      payload.showIntroDialog = trainingScenario.scenario.showIntroDialog ?? true;
      payload.introDialogTitle = trainingScenario.scenario.introDialogTitle ?? null;
      payload.introDialogDescription = trainingScenario.scenario.introDialogDescription ?? null;
      payload.introDialogPlaceholder = trainingScenario.scenario.introDialogPlaceholder ?? null;
      payload.introDialogHint = trainingScenario.scenario.introDialogHint ?? null;
      payload.introDialogButtonLabel = trainingScenario.scenario.introDialogButtonLabel ?? null;
      payload.roundEndingPrompt = trainingScenario.scenario.roundEndingPrompt ?? null;
      payload.silenceNudgeTemplate = trainingScenario.scenario.silenceNudgeTemplate ?? null;
      payload.shortAnswerNudge = trainingScenario.scenario.shortAnswerNudge ?? null;
      payload.quietSpeakerNudge = trainingScenario.scenario.quietSpeakerNudge ?? null;
      payload.autoSuccessPrompt = trainingScenario.scenario.autoSuccessPrompt ?? null;
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Voice call config error:', error);
    return NextResponse.json({ error: INTERNAL_SERVER_ERROR }, { status: 500 });
  }
}

export const runtime = 'nodejs';

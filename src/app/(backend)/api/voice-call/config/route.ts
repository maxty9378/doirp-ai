import { userCodes, users } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { serverDB } from '@/database/server';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { getTrainingScenarioWithKnowledge } from '@/server/services/training';

const TP_PRICE_AGENT_ID = 'training-tp-price-objection';
const DEFAULT_TRAINING_AGENT_ID = 'training-gfd-stress';
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
const DEFAULT_SILENCE_HARD_HANGUP_MS = 180_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = ['Алло, вы меня вообще слышите?'];
const DEFAULT_LIVE_VOICE = 'Kore';
const TRAINING_TURN_TOOL_NAME = 'get_training_turn_context';

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

const buildTpPriceVoiceSystem = (preset: {
  goals?: string[];
  scenario_context?: string;
  user_role?: string;
}) => {
  const scenario = preset.scenario_context ?? '';
  const userRole = preset.user_role ?? '';
  const goals = preset.goals?.length ? preset.goals.map((goal) => `- ${goal}`).join('\n') : '';

  return [
    'Ты — Марина Ивановна, директор магазина «У дома».',
    'Идёт живой разговор с опытным торговым представителем.',
    'Говори только от лица Марины Ивановны.',
    'Отвечай коротко: 1-2 предложения, по-русски, без метакомментариев.',
    'Держи жёсткий тон и дави по возражению «дорого», но реагируй на сильные аргументы о доходности, сервисе и маркетинговой поддержке.',
    'Не своди переговоры к скидке как к единственному решению.',
    'После каждой своей реплики добавляй технический тег в конце: [CURRENT_SCORE: X], где X — накопительный счёт.',
    '',
    `Легенда:\n${scenario}`,
    '',
    `Роль пользователя:\n${userRole}`,
    '',
    `Цели тренировки:\n${goals}`,
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
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
        return NextResponse.json(
          { error: 'Лимит запусков тренажёра исчерпан. Обратитесь к администратору.' },
          { status: 403 },
        );
      }
    }

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || DEFAULT_TRAINING_AGENT_ID;
    const speakerName = searchParams.get('speakerName')?.trim() || null;
    const preset = VOICE_CALL_PRESETS[agentId];
    const trainingScenario = await getTrainingScenarioWithKnowledge(agentId).catch((dbError) => {
      console.warn('[voice-call/config] Training scenario from DB failed:', dbError);
      return null;
    });

    if (agentId.startsWith('training-') && !trainingScenario && !preset) {
      return NextResponse.json(
        { error: 'Сценарий тренажёра не найден в базе данных.' },
        { status: 404 },
      );
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured. Add it in .env or server settings.' },
        { status: 503 },
      );
    }

    const isTpPrice = agentId === TP_PRICE_AGENT_ID;
    const sessionUser = (session as any)?.user || {};
    const rawFullName: string | undefined =
      sessionUser.fullName ||
      sessionUser.full_name ||
      sessionUser.name ||
      sessionUser.username ||
      sessionUser.email;
    const userFullName = (rawFullName && String(rawFullName).trim()) || 'Менеджер';

    const baseSystemInstruction = isTpPrice && preset ? buildTpPriceVoiceSystem(preset) : preset?.systemRole ?? '';
    const systemInstructionBase = trainingScenario?.scenario.systemPrompt || baseSystemInstruction;

    const userContextLines = [
      'Контекст собеседника:',
      `- Полное имя в аккаунте: ${userFullName}.`,
      speakerName
        ? `- В этой сессии на вопросы отвечает сотрудник: ${speakerName}. Обращайся к нему по этому имени.`
        : '- Если отдельное имя не передано, обращайся к собеседнику вежливо на «вы».',
    ];

    const systemInstruction = [systemInstructionBase, userContextLines.join('\n')]
      .filter(Boolean)
      .join('\n\n');

    const requestedVoice = trainingScenario?.scenario.voiceName || DEFAULT_LIVE_VOICE;
    const voiceName = LIVE_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_LIVE_VOICE;

    const assistantLabel =
      trainingScenario?.scenario.assistantLabel ||
      (isTpPrice ? 'Директор магазина (Марина Ивановна)' : 'ИИ-агент');
    const userLabel =
      trainingScenario?.scenario.userLabel ||
      (isTpPrice ? 'Вы (Торговый представитель)' : 'Вы');

    const DEV_DEFAULT_VOICE_WS = 'wss://apidoirp.ru/voice-call-ws';
    const rawProxyUrl =
      process.env.VOICE_CALL_WS_PROXY_URL?.trim() ||
      (process.env.NODE_ENV === 'development'
        ? process.env.VOICE_CALL_WS_PROXY_DEV?.trim() || DEV_DEFAULT_VOICE_WS
        : null);
    const geminiWsUrl = rawProxyUrl ? rawProxyUrl.replace(/^http/, 'ws') : null;

    const payload: Record<string, unknown> = {
      apiKey,
      ...(geminiWsUrl ? { geminiWsUrl } : {}),
      assistantLabel,
      contextWindow: trainingScenario?.scenario.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      enableCheckpoints: trainingScenario?.scenario.enableCheckpoints ?? isTpPrice,
      enableScoring: trainingScenario?.scenario.enableScoring ?? true,
      enableTurnPlanner: Boolean(trainingScenario),
      silenceHardHangupMs:
        trainingScenario?.scenario.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
      silenceNudgeAfterMs:
        trainingScenario?.scenario.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
      silenceNudgeCooldownMs:
        trainingScenario?.scenario.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
      silenceNudgePhrases:
        trainingScenario?.scenario.silenceNudgePhrases?.length
          ? trainingScenario.scenario.silenceNudgePhrases
          : DEFAULT_SILENCE_NUDGE_PHRASES,
      speakerName: speakerName || undefined,
      systemInstruction,
      turnPlannerToolName: trainingScenario ? TRAINING_TURN_TOOL_NAME : null,
      userLabel,
      userName: userFullName,
      voiceName,
      sessionDurationMs:
        trainingScenario?.scenario.sessionDurationMs ??
        trainingScenario?.scenario.silenceHardHangupMs ??
        DEFAULT_SILENCE_HARD_HANGUP_MS,
    };

    if (trainingScenario) {
      payload.autoSuccessPrompt = trainingScenario.scenario.autoSuccessPrompt ?? null;
      payload.checkpointIds = trainingScenario.scenario.checkpointIds ?? [];
      payload.goals = trainingScenario.scenario.goals ?? [];
      payload.introDialogButtonLabel = trainingScenario.scenario.introDialogButtonLabel ?? null;
      payload.introDialogDescription = trainingScenario.scenario.introDialogDescription ?? null;
      payload.introDialogHint = trainingScenario.scenario.introDialogHint ?? null;
      payload.introDialogPlaceholder = trainingScenario.scenario.introDialogPlaceholder ?? null;
      payload.introDialogTitle = trainingScenario.scenario.introDialogTitle ?? null;
      payload.legend = trainingScenario.scenario.legend ?? null;
      payload.openingInstruction = trainingScenario.scenario.openingInstruction ?? null;
      payload.quietSpeakerNudge = trainingScenario.scenario.quietSpeakerNudge ?? null;
      payload.roundEndingPrompt = trainingScenario.scenario.roundEndingPrompt ?? null;
      payload.scoreDisplayLabel = trainingScenario.scenario.scoreDisplayLabel ?? null;
      payload.scoreLevelLabels = trainingScenario.scenario.scoreLevelLabels ?? null;
      payload.shortAnswerNudge = trainingScenario.scenario.shortAnswerNudge ?? null;
      payload.showIntroDialog = trainingScenario.scenario.showIntroDialog ?? true;
      payload.showLegend = trainingScenario.scenario.showLegend ?? true;
      payload.silenceNudgeTemplate = trainingScenario.scenario.silenceNudgeTemplate ?? null;
      payload.title = trainingScenario.scenario.title ?? null;
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('Voice call config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

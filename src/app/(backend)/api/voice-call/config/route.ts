import { userCodes, users } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import {
  GFD_STRESS_TRAINING_KEY,
  GFD_STRESS_TRAINING_KNOWLEDGE,
  GFD_STRESS_TRAINING_SCENARIO,
} from '@/config/training/gfdStressScenario';
import { VOICE_CALL_PRESETS } from '@/config/initialAgents';
import { getLLMConfig } from '@/envs/llm';
import {
  buildTrainingKnowledgeContext,
  getTrainingScenarioWithKnowledge,
  type TrainingScenarioWithKnowledge,
} from '@/server/services/training';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { serverDB } from '@/database/server';

const TP_PRICE_AGENT_ID = 'training-tp-price-objection';
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
// Длительность раунда по умолчанию: 3 минуты
const DEFAULT_SILENCE_HARD_HANGUP_MS = 180_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = ['Алло, вы меня вообще слушаете?'];
const DEFAULT_LIVE_VOICE = 'Kore';
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
const LIVE_BEHAVIOR_RULES = [
  'Если собеседник закрывает ключевые возражения и фиксирует следующий шаг, заверши разговор сам.',
  'Финал диалога должен звучать как естественное завершение живой беседы на конференции, без служебных фраз про «кладу трубку».',
  'Если собеседник переходит на оскорбления или хамство, ответь жестко, предупреди о последствиях и заверши разговор.',
  'Каждая реплика короткая: 1-2 предложения, только прямая речь персонажа.',
].join('\n');

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
    'Идет живой разговор с опытным торговым представителем.',
    'Говори только от лица Марины Ивановны.',
    'Отвечай коротко (1-2 предложения), по-русски, без рассуждений и метакомментариев.',
    'Держи жесткий тон и дави по возражению «Дорого», но реагируй на сильные аргументы о доходности, сервисе и маркетинговой поддержке.',
    'Нельзя сводить переговоры к прямой скидке как единственному выходу.',
    'После каждой своей реплики добавляй технический тег в конце: [CURRENT_SCORE: X], где X — накопительный счет.',
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
    const agentId = searchParams.get('agentId') || 'training-gfd-stress';
    const speakerName = searchParams.get('speakerName')?.trim() || null;
    const preset = VOICE_CALL_PRESETS[agentId];

    let trainingScenario: Awaited<ReturnType<typeof getTrainingScenarioWithKnowledge>> = null;
    try {
      trainingScenario = await getTrainingScenarioWithKnowledge(agentId);
    } catch (dbError) {
      console.warn('[voice-call/config] Training scenario from DB failed:', dbError);
    }
    // Fallback на сид GFD при недоступности БД (таблицы не созданы и т.п.)
    if (!trainingScenario && agentId === GFD_STRESS_TRAINING_KEY) {
      trainingScenario = {
        scenario: GFD_STRESS_TRAINING_SCENARIO as TrainingScenarioWithKnowledge['scenario'],
        knowledgeEntries: GFD_STRESS_TRAINING_KNOWLEDGE as unknown as TrainingScenarioWithKnowledge['knowledgeEntries'],
      };
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
    const sessionUser =
      (session as any)?.user || {};
    const rawFullName: string | undefined =
      sessionUser.fullName ||
      sessionUser.full_name ||
      sessionUser.name ||
      sessionUser.username ||
      sessionUser.email;
    const userFullName = (rawFullName && String(rawFullName).trim()) || 'Менеджер';
    const userFirstName = userFullName.split(' ')[0] || userFullName;
    const baseSystemInstruction = isTpPrice && preset ? buildTpPriceVoiceSystem(preset) : preset?.systemRole ?? '';
    const knowledgeContext = trainingScenario
      ? buildTrainingKnowledgeContext(trainingScenario.knowledgeEntries)
      : null;

    const baseWithScenario = trainingScenario
      ? [trainingScenario.scenario.systemPrompt, knowledgeContext].filter(Boolean).join('\n\n')
      : `${baseSystemInstruction}\n\n${LIVE_BEHAVIOR_RULES}`;

    const userContextLines = [
      'Данные о собеседнике (менеджере):',
      `- Полное имя в аккаунте: ${userFullName}.`,
      speakerName
        ? `- В этой сессии на вопросы отвечает сотрудник: ${speakerName}. Обращайся к нему по этому имени.`
        : '- В диалоге обращайся к собеседнику вежливо на «вы», без упоминания имени из аккаунта, если явно не указано другое имя.',
    ];

    const systemInstruction = [baseWithScenario, userContextLines.join('\n')].join('\n\n');
    const requestedVoice = trainingScenario?.scenario.voiceName || DEFAULT_LIVE_VOICE;
    const voiceName = LIVE_VOICES.has(requestedVoice) ? requestedVoice : DEFAULT_LIVE_VOICE;

    const assistantLabel =
      trainingScenario?.scenario.assistantLabel ||
      (isTpPrice ? 'Директор магазина (Марина Ивановна)' : 'ИИ-агент');
    const userLabel =
      trainingScenario?.scenario.userLabel ||
      (isTpPrice ? 'Вы (Торговый представитель)' : 'Вы');

    /** Публичный WS-прокси (VPS + nginx). Локальный dev без переменной — через него, чтобы не требовать :3011. */
    const DEV_DEFAULT_VOICE_WS = 'wss://apidoirp.ru/voice-call-ws';
    const rawProxyUrl =
      process.env.VOICE_CALL_WS_PROXY_URL?.trim() ||
      (process.env.NODE_ENV === 'development'
        ? process.env.VOICE_CALL_WS_PROXY_DEV?.trim() || DEV_DEFAULT_VOICE_WS
        : null);
    const geminiWsUrl = rawProxyUrl
      ? rawProxyUrl.replace(/^http/, 'ws')
      : null;

    const payload: Record<string, unknown> = {
      apiKey,
      ...(geminiWsUrl ? { geminiWsUrl } : {}),
      systemInstruction,
      voiceName,
      assistantLabel,
      userLabel,
      userName: userFullName,
      speakerName: speakerName || undefined,
      contextWindow: trainingScenario?.scenario.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
      silenceNudgeAfterMs:
        trainingScenario?.scenario.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
      silenceNudgeCooldownMs:
        trainingScenario?.scenario.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
      sessionDurationMs:
        trainingScenario?.scenario.sessionDurationMs ??
        trainingScenario?.scenario.silenceHardHangupMs ??
        DEFAULT_SILENCE_HARD_HANGUP_MS,
      silenceHardHangupMs:
        trainingScenario?.scenario.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
      silenceNudgePhrases:
        trainingScenario?.scenario.silenceNudgePhrases?.length
          ? trainingScenario.scenario.silenceNudgePhrases
          : DEFAULT_SILENCE_NUDGE_PHRASES,
      enableCheckpoints: trainingScenario?.scenario.enableCheckpoints ?? isTpPrice,
      // Для тренажёров по умолчанию включаем скoring, даже если в сид‑данных не выставлен.
      enableScoring: trainingScenario?.scenario.enableScoring ?? true,
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';


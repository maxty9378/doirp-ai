import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS, VOICE_SIMULATOR_LPR_PRESET } from '@/config/initialAgents';
import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';

const TP_PRICE_AGENT_ID = 'training-tp-price-objection';

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

    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get('agentId') || 'voice-simulator-lpr';
    const preset = VOICE_CALL_PRESETS[agentId] || VOICE_SIMULATOR_LPR_PRESET;

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GOOGLE_API_KEY is not configured. Add it in .env or server settings.' },
        { status: 503 },
      );
    }

    const isTpPrice = agentId === TP_PRICE_AGENT_ID;
    const systemInstruction = isTpPrice ? buildTpPriceVoiceSystem(preset) : preset.systemRole;
    const voiceName = isTpPrice ? 'Kore' : 'Charon';

    return NextResponse.json({
      apiKey,
      systemInstruction,
      voiceName,
    });
  } catch (error) {
    console.error('Voice call config error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

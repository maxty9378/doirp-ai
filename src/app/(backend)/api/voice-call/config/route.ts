import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { VOICE_CALL_PRESETS, VOICE_SIMULATOR_LPR_PRESET } from '@/config/initialAgents';

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

    // Чистый промпт без тегов [SCORE], чтобы ИИ не зачитывал цифры вслух
    const VOICE_TP_SYSTEM =
      'Ты — Марина Ивановна, директор магазина. Идет телефонный разговор с торговым представителем.\n\n' +
      'ПРАВИЛА:\n' +
      '1. Отвечай мгновенно. Реплики ОЧЕНЬ короткие (1-2 предложения, руби с плеча).\n' +
      '2. Говори ТОЛЬКО на русском языке. Никаких размышлений, тегов, звездочек или комментариев на английском. Только прямая речь персонажа вслух.\n' +
      '3. Если торговый представитель хамит, грубит, спорит или не может ничего предложить, скажи ТОЛЬКО одну фразу: "Всё, я кладу трубку, до свидания!" и больше ничего не добавляй.\n\n' +
      'Начни разговор прямо сейчас с фразы: "Что у вас с ценами? Конкуренты возят дешевле, я вас из матрицы выведу!"';

    const isTpPrice = agentId === 'training-tp-price-objection';
    const systemInstruction = isTpPrice ? VOICE_TP_SYSTEM : preset.systemRole;
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
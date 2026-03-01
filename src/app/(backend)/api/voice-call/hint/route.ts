import { getLLMConfig } from '@/envs/llm';
import apiKeyManager from '@/server/modules/ModelRuntime/apiKeyManager';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';

const GOOGLE_API_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const GEMINI_TEXT_MODEL = 'gemini-2.0-flash';

interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { transcript?: TranscriptEntry[] };
    const transcript = Array.isArray(body?.transcript) ? body.transcript : [];
    if (transcript.length === 0) {
      return NextResponse.json({ error: 'transcript is required (non-empty array)' }, { status: 400 });
    }

    const { GOOGLE_API_KEY } = getLLMConfig();
    const apiKey = apiKeyManager.pick(GOOGLE_API_KEY);
    if (!apiKey) {
      return NextResponse.json({ error: 'No API key' }, { status: 503 });
    }

    const prompt = `Ты — опытный бизнес-тренер. Ниже представлен транскрипт текущего звонка между стажером-продавцом (user) и недовольным клиентом (ai).
Твоя задача: напиши ОДНУ короткую, идеальную фразу (прямую речь), которую стажер должен сказать прямо сейчас, чтобы отработать возражение и успокоить клиента.
Не пиши никаких вступлений, только саму фразу, которую нужно произнести вслух.

Транскрипт диалога:
${transcript.map((t) => `${t.role.toUpperCase()}: ${t.text}`).join('\n')}`;

    const response = await fetch(
      `${GOOGLE_API_BASE}/models/${GEMINI_TEXT_MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 256 },
        }),
      },
    );

    const data = (await response.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      error?: { message?: string };
    };

    if (!response.ok) {
      return NextResponse.json(
        { error: data?.error?.message || 'LLM request failed' },
        { status: response.status || 500 },
      );
    }

    const hint =
      data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ||
      'Попробуйте спросить о текущих продажах конкурента.';

    return NextResponse.json({ hint });
  } catch (error) {
    console.error('Hint generation error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate hint' },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

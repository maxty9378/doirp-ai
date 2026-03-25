import { type VoiceCallSessionAnalysisResult, voiceCallSessions } from '@lobechat/database/schemas';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { serverDB } from '@/database/server';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export const runtime = 'nodejs';

export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(
        1,
        parseInt(searchParams.get('limit') || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT,
      ),
    );
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    const rows = await serverDB
      .select({
        id: voiceCallSessions.id,
        scenarioId: voiceCallSessions.scenarioId,
        transcript: voiceCallSessions.transcript,
        analysisResult: voiceCallSessions.analysisResult,
        score: voiceCallSessions.score,
        hangUpReason: voiceCallSessions.hangUpReason,
        durationSeconds: voiceCallSessions.durationSeconds,
        createdAt: voiceCallSessions.createdAt,
      })
      .from(voiceCallSessions)
      .where(eq(voiceCallSessions.userId, session.user.id))
      .orderBy(desc(voiceCallSessions.createdAt))
      .limit(limit)
      .offset(offset);

    const list = rows.map((r) => ({
      id: r.id,
      scenarioId: r.scenarioId,
      overallScore:
        (r.analysisResult as VoiceCallSessionAnalysisResult | null)?.overallScore ??
        r.score ??
        null,
      score: r.score,
      hangUpReason: r.hangUpReason ?? undefined,
      durationSeconds: r.durationSeconds ?? undefined,
      createdAt: r.createdAt,
    }));

    return NextResponse.json({ sessions: list });
  } catch (e) {
    console.error('[voice-call/sessions GET]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      scenarioId?: string;
      agentId?: string;
      transcript?: Array<{ role: 'ai' | 'user'; text: string }>;
      analysisResult?: VoiceCallSessionAnalysisResult;
      hangUpReason?: string;
      durationSeconds?: number;
      score?: number;
    };

    const scenarioId =
      typeof body.scenarioId === 'string' ? body.scenarioId.trim() : body.agentId?.trim();
    if (!scenarioId) {
      return NextResponse.json({ error: 'scenarioId or agentId is required' }, { status: 400 });
    }

    const transcript = Array.isArray(body.transcript) ? body.transcript : [];
    if (transcript.length === 0) {
      return NextResponse.json(
        { error: 'transcript is required (non-empty array)' },
        { status: 400 },
      );
    }

    const cleanedTranscript = sanitizeVoiceCallTranscript(transcript, { mode: 'store' });
    if (cleanedTranscript.length === 0) {
      return NextResponse.json(
        { error: 'transcript is required (non-empty array after cleanup)' },
        { status: 400 },
      );
    }

    const [created] = await serverDB
      .insert(voiceCallSessions)
      .values({
        userId: session.user.id,
        scenarioId,
        transcript: cleanedTranscript,
        analysisResult: body.analysisResult ?? null,
        score: typeof body.score === 'number' ? body.score : null,
        hangUpReason: typeof body.hangUpReason === 'string' ? body.hangUpReason : null,
        durationSeconds: typeof body.durationSeconds === 'number' ? body.durationSeconds : null,
      })
      .returning();

    if (!created) {
      return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }

    return NextResponse.json({ id: created.id, session: created });
  } catch (e) {
    console.error('[voice-call/sessions POST]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

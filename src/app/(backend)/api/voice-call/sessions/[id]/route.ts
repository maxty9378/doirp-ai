import {
  type VoiceCallSessionAnalysisResult,
  type VoiceCallSessionDebugLog,
  voiceCallSessions,
} from '@lobechat/database/schemas';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { serverDB } from '@/database/server';
import { sanitizeVoiceCallTranscript } from '@/utils/voiceCallEchoFilter';

import { normalizeVoiceCallTranscriptWithGemini } from '../../_normalizeTranscript';

export const runtime = 'nodejs';

const MAX_DEBUG_EVENTS = 300;

const normalizeDebugLog = (value: unknown): VoiceCallSessionDebugLog | null => {
  if (!value || typeof value !== 'object') return null;

  const candidate = value as {
    agentId?: unknown;
    events?: unknown;
    status?: unknown;
  };

  const events = Array.isArray(candidate.events)
    ? candidate.events
        .flatMap((event) => {
          if (!event || typeof event !== 'object') return [];
          const record = event as { at?: unknown; data?: unknown; type?: unknown };
          return [{
            at: typeof record.at === 'string' ? record.at : new Date().toISOString(),
            data:
              record.data && typeof record.data === 'object'
                ? (record.data as Record<string, unknown>)
                : undefined,
            type: typeof record.type === 'string' ? record.type : 'unknown',
          }];
        })
        .slice(-MAX_DEBUG_EVENTS)
    : [];

  return {
    agentId: typeof candidate.agentId === 'string' ? candidate.agentId : 'unknown',
    events,
    status: typeof candidate.status === 'string' ? candidate.status : 'unknown',
  };
};

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const [row] = await serverDB
      .select()
      .from(voiceCallSessions)
      .where(and(eq(voiceCallSessions.id, id), eq(voiceCallSessions.userId, session.user.id)))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Сессия не найдена' }, { status: 404 });
    }

    const transcript = await normalizeVoiceCallTranscriptWithGemini(
      sanitizeVoiceCallTranscript(row.transcript, { mode: 'store' }),
      { force: true },
    );

    return NextResponse.json({
      ...row,
      transcript,
    });
  } catch (e) {
    console.error('[voice-call/sessions/[id] GET]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await params;
    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      analysisResult?: VoiceCallSessionAnalysisResult;
      debugLog?: VoiceCallSessionDebugLog | null;
    };
    const debugLog = body.debugLog === undefined ? undefined : normalizeDebugLog(body.debugLog);

    const [updated] = await serverDB
      .update(voiceCallSessions)
      .set({
        analysisResult: body.analysisResult ?? null,
        ...(debugLog !== undefined ? { debugLog } : {}),
      })
      .where(and(eq(voiceCallSessions.id, id), eq(voiceCallSessions.userId, session.user.id)))
      .returning();

    if (!updated) {
      return NextResponse.json({ error: 'Сессия не найдена' }, { status: 404 });
    }

    return NextResponse.json(updated);
  } catch (e) {
    console.error('[voice-call/sessions/[id] PATCH]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

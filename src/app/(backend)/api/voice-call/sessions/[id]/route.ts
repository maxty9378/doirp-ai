import { voiceCallSessions } from '@lobechat/database/schemas';
import { and, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { serverDB } from '@/database/server';

export const runtime = 'nodejs';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
      .where(
        and(
          eq(voiceCallSessions.id, id),
          eq(voiceCallSessions.userId, session.user.id),
        ),
      )
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Сессия не найдена' }, { status: 404 });
    }

    return NextResponse.json(row);
  } catch (e) {
    console.error('[voice-call/sessions/[id] GET]', e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

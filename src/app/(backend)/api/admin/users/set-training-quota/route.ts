import { userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

async function ensureAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user as { email?: string; username?: string } | undefined;
  const username = user?.username;
  const email = user?.email?.toLowerCase();
  const byUsername = username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase();
  if (!byUsername && !byEmail) return null;
  return session;
}

/**
 * POST /api/admin/users/set-training-quota — set training session quota for a user (admin only).
 * Body: { userId: string, trainingSessionQuota: number }
 */
export async function POST(req: NextRequest) {
  const session = await ensureAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const userId = typeof body?.userId === 'string' ? body.userId.trim() : '';
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    const raw = body?.trainingSessionQuota;
    const trainingSessionQuota =
      typeof raw === 'number' && Number.isInteger(raw) && raw >= 0
        ? raw
        : typeof raw === 'string'
          ? Math.max(0, parseInt(raw, 10) || 0)
          : undefined;
    if (trainingSessionQuota === undefined) {
      return NextResponse.json(
        { error: 'trainingSessionQuota is required (non-negative integer)' },
        { status: 400 },
      );
    }

    const result = await serverDB
      .update(userCodes)
      .set({ trainingSessionQuota, updatedAt: new Date() })
      .where(eq(userCodes.userId, userId))
      .returning({ id: userCodes.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found in user_codes' }, { status: 404 });
    }

    return NextResponse.json({ ok: true, trainingSessionQuota });
  } catch (error) {
    console.error('Error setting training quota:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

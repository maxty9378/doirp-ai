import { userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionAdminUser } from '@/server/utils/admin';

async function ensureAdmin() {
  return getSessionAdminUser();
}

/**
 * POST /api/admin/users/set-training-quota — set training session quota for a user (admin only).
 * Body: { userId: string, trainingSessionQuota: number }
 */
export async function POST(req: NextRequest) {
  const admin = await ensureAdmin();
  if (!admin) {
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

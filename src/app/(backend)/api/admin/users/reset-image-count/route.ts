import { users } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionAdminUser } from '@/server/utils/admin';

async function ensureAdmin() {
  return getSessionAdminUser();
}

/**
 * POST /api/admin/users/reset-image-count — reset daily image count for a user (admin only).
 * Body: { userId: string }
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

    const result = await serverDB
      .update(users)
      .set({
        dailyImageCount: 0,
        lastImageDate: null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error resetting image count:', error);
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

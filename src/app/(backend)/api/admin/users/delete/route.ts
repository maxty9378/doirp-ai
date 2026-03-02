import { users } from '@lobechat/database/schemas';
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
  const user = session?.user as { id?: string; email?: string; username?: string } | undefined;
  const username = user?.username;
  const email = user?.email?.toLowerCase();
  const byUsername = username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase();
  if (!byUsername && !byEmail) return null;
  return session;
}

/**
 * POST /api/admin/users/delete — delete a user (admin only). Cascades to account, user_codes, etc.
 * Body: { userId: string }
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

    const currentUserId = (session.user as { id?: string })?.id;
    if (currentUserId && currentUserId === userId) {
      return NextResponse.json(
        { error: 'Cannot delete yourself' },
        { status: 400 },
      );
    }

    const result = await serverDB
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ id: users.id });

    if (result.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Error deleting user:', error);
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

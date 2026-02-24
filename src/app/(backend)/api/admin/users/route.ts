import { createNanoId } from '@lobechat/database';
import { DEFAULT_USER_TOKEN_QUOTA, userCodes } from '@lobechat/database/schemas';
import { desc } from 'drizzle-orm';
import { headers } from 'next/headers';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

function generateCode(): string {
  return createNanoId(10)();
}

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
 * GET /api/admin/users — list all user codes (admin only).
 */
export async function GET() {
  const session = await ensureAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const list = await serverDB
      .select({
        code: userCodes.code,
        createdAt: userCodes.createdAt,
        email: userCodes.email,
        id: userCodes.id,
        tokenQuota: userCodes.tokenQuota,
        tokensUsed: userCodes.tokensUsed,
        userId: userCodes.userId,
      })
      .from(userCodes)
      .orderBy(desc(userCodes.createdAt));
    return NextResponse.json({ users: list });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error listing admin users:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}

/**
 * POST /api/admin/users — create a user with email + generated code (admin only).
 * Body: { email: string, tokenQuota?: number }
 * Returns: { email: string, code: string, tokenQuota: number }
 */
export async function POST(req: NextRequest) {
  const session = await ensureAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const rawQuota = body?.tokenQuota;
    const tokenQuota =
      typeof rawQuota === 'number' && Number.isInteger(rawQuota) && rawQuota >= 0
        ? rawQuota
        : DEFAULT_USER_TOKEN_QUOTA;

    const code = generateCode();

    const newUser = await auth.api.createUser({
      body: {
        email,
        name: email,
        password: code,
      },
    });

    const userId = newUser?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Failed to create user' }, { status: 500 });
    }

    const id = createNanoId(12)();
    await serverDB.insert(userCodes).values({
      code,
      email,
      id,
      tokenQuota,
      userId,
    });

    return NextResponse.json({ code, email, tokenQuota });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error creating admin user:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

import { createNanoId, idGenerator } from '@lobechat/database';
import { account, DEFAULT_USER_TOKEN_QUOTA, userCodes, users } from '@lobechat/database/schemas';
import { hashPassword } from 'better-auth/crypto';
import { desc, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';
import { UserService } from '@/server/services/user';

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
    await ensureUserCodesSchema();

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
    await ensureUserCodesSchema();

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

    // Check if user with this email already exists
    const existingUser = await serverDB.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email already registered' },
        { status: 400 },
      );
    }

    // Create user directly in DB (bypassing better-auth admin permission check)
    const userId = idGenerator('user', 32 - 'user_'.length);
    const now = new Date();
    const passwordHash = await hashPassword(code);
    const accountId = createNanoId(12)();

    // Insert user
    await serverDB.insert(users).values({
      id: userId,
      email,
      normalizedEmail: email.toLowerCase(),
      fullName: email,
      emailVerified: true,
      createdAt: now,
      updatedAt: now,
      lastActiveAt: now,
    });

    // Insert account record with password (for credential login)
    await serverDB.insert(account).values({
      id: accountId,
      userId,
      accountId: email,
      providerId: 'credential',
      password: passwordHash,
      createdAt: now,
      updatedAt: now,
    });

    // Initialize user (onboarding, analytics). Non-fatal: user already created.
    try {
      const userService = new UserService(serverDB);
      await userService.initUser({
        id: userId,
        email,
        username: null,
        createdAt: now,
      });
    } catch (initError) {
      console.error('Admin create user: initUser failed (user created):', initError);
    }

    // Insert user code record
    const userCodeId = createNanoId(12)();
    await serverDB.insert(userCodes).values({
      code,
      email,
      id: userCodeId,
      tokenQuota,
      userId,
    });

    return NextResponse.json({ code, email, tokenQuota });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    const cause = error instanceof Error ? error.cause : undefined;
    console.error('Error creating admin user:', error);

    // Return 400 for known client errors (e.g. duplicate email)
    const errMsg = (cause instanceof Error ? cause.message : message).toLowerCase();
    if (
      errMsg.includes('unique') ||
      errMsg.includes('duplicate') ||
      errMsg.includes('already exists') ||
      errMsg.includes('already registered')
    ) {
      return NextResponse.json(
        { error: 'Email already registered', details: process.env.NODE_ENV === 'development' ? message : undefined },
        { status: 400 },
      );
    }

    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

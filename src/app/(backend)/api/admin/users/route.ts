import { createNanoId, idGenerator } from '@lobechat/database';
import { account, DEFAULT_USER_TOKEN_QUOTA, userCodes, users } from '@lobechat/database/schemas';
import { hashPassword } from 'better-auth/crypto';
import { desc, eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionAdminUser } from '@/server/utils/admin';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';
import { syncUserCodesUsage } from '@/server/services/admin/syncUserCodesUsage';
import { UserService } from '@/server/services/user';

function generateCode(): string {
  return createNanoId(10)();
}

async function ensureAdmin() {
  return getSessionAdminUser();
}

/**
 * GET /api/admin/users — list all user codes (admin only).
 */
export async function GET() {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureUserCodesSchema();
    await syncUserCodesUsage();

    const rows = await serverDB
      .select({
        accountType: userCodes.accountType,
        code: userCodes.code,
        createdAt: userCodes.createdAt,
        dailyImageCount: users.dailyImageCount,
        email: userCodes.email,
        id: userCodes.id,
        lastImageDate: users.lastImageDate,
        plainPassword: userCodes.plainPassword,
        tokenQuota: userCodes.tokenQuota,
        trainingSessionQuota: userCodes.trainingSessionQuota,
        trainingSessionsUsed: userCodes.trainingSessionsUsed,
        tokensUsed: userCodes.tokensUsed,
        userId: userCodes.userId,
      })
      .from(userCodes)
      .innerJoin(users, eq(users.id, userCodes.userId))
      .orderBy(desc(userCodes.createdAt));
    const usersList = rows.map(({ plainPassword, ...rest }) => ({
      ...rest,
      password: plainPassword ?? undefined,
    }));
    return NextResponse.json({ users: usersList });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error listing admin users:', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? message : undefined,
      },
      { status: 500 },
    );
  }
}

const MIN_PASSWORD_LENGTH = 6;
const USER_ACCOUNT_TYPES = ['standard', 'training-only'] as const;
type UserAccountType = (typeof USER_ACCOUNT_TYPES)[number];

/**
 * POST /api/admin/users — create a user with email + password (admin only).
 * Body: { email: string, password: string, tokenQuota?: number, accountType?: 'standard' | 'training-only', trainingSessionQuota?: number }
 * Returns: { email: string, tokenQuota: number, accountType: string }
 */
export async function POST(req: NextRequest) {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  try {
    await ensureUserCodesSchema();

    const body = await req.json();
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }
    const password = typeof body?.password === 'string' ? body.password : '';
    if (!password || password.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json(
        { error: 'Password is required (min 6 characters)' },
        { status: 400 },
      );
    }
    const rawQuota = body?.tokenQuota;
    const tokenQuota =
      typeof rawQuota === 'number' && Number.isInteger(rawQuota) && rawQuota >= 0
        ? rawQuota
        : DEFAULT_USER_TOKEN_QUOTA;
    const rawAccountType = typeof body?.accountType === 'string' ? body.accountType : 'standard';
    const accountType: UserAccountType = USER_ACCOUNT_TYPES.includes(rawAccountType as UserAccountType)
      ? (rawAccountType as UserAccountType)
      : 'standard';
    const rawTrainingSessionQuota = body?.trainingSessionQuota;
    const trainingSessionQuota =
      accountType === 'training-only'
        ? typeof rawTrainingSessionQuota === 'number' &&
          Number.isInteger(rawTrainingSessionQuota) &&
          rawTrainingSessionQuota > 0
          ? rawTrainingSessionQuota
          : null
        : null;

    // Check if user with this email already exists
    const existingUser = await serverDB.query.users.findFirst({
      where: eq(users.email, email),
    });
    if (existingUser) {
      return NextResponse.json({ error: 'Email already registered' }, { status: 400 });
    }

    // Create user with email + password (no login code)
    const userId = idGenerator('user', 32 - 'user_'.length);
    const now = new Date();
    const passwordHash = await hashPassword(password);
    const accountId = createNanoId(12)();

    // Insert user
    await serverDB.insert(users).values({
      id: userId,
      email,
      normalizedEmail: email.toLowerCase(),
      fullName: email,
      role: accountType === 'training-only' ? 'training_only' : 'user',
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

    // Insert user_codes record (for token quota only; login is email+password)
    const userCodeId = createNanoId(12)();
    const internalCode = generateCode(); // unique placeholder, not used for login
    await serverDB.insert(userCodes).values({
      accountType,
      code: internalCode,
      email,
      id: userCodeId,
      plainPassword: password,
      tokenQuota,
      trainingSessionQuota,
      trainingSessionsUsed: 0,
      userId,
    });

    return NextResponse.json({ accountType, email, tokenQuota, trainingSessionQuota, userId });
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
        {
          error: 'Email already registered',
          details: process.env.NODE_ENV === 'development' ? message : undefined,
        },
        { status: 400 },
      );
    }

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

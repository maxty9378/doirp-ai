import { account, userCodes } from '@lobechat/database/schemas';
import { hashPassword } from 'better-auth/crypto';
import { and, eq } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionAdminUser } from '@/server/utils/admin';

function generatePassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

async function ensureAdmin() {
  return getSessionAdminUser();
}

/**
 * POST /api/admin/users/reset-password — set new random password for a user (admin only).
 * Body: { userId: string }
 * Returns: { password: string }
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

    const newPassword = generatePassword();
    const passwordHash = await hashPassword(newPassword);

    const result = await serverDB
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(and(eq(account.userId, userId), eq(account.providerId, 'credential')))
      .returning({ id: account.id });

    if (result.length === 0) {
      return NextResponse.json(
        { error: 'Account not found or not credential-based' },
        { status: 404 },
      );
    }

    await serverDB
      .update(userCodes)
      .set({ plainPassword: newPassword, updatedAt: new Date() })
      .where(eq(userCodes.userId, userId));

    return NextResponse.json({ password: newPassword });
  } catch (error) {
    console.error('Error resetting password:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      { error: 'Internal server error', details: process.env.NODE_ENV === 'development' ? message : undefined },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

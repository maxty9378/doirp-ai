import { and, eq, or } from 'drizzle-orm';
import { type NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { account } from '@/database/schemas/betterAuth';
import { users } from '@/database/schemas/user';
import { getServerDB } from '@/database/server';

export interface CheckUserResponseData {
  exists: boolean;
  hasPassword?: boolean;
}

const normalized = (email: string) => email.toLowerCase().trim();

/**
 * Check if a user exists by email
 * @param req - POST request with { email: string }
 * @returns { exists: boolean, hasPassword?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email } = body;

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ error: 'Email is required', exists: false }, { status: 400 });
    }

    const value = normalized(email);

    const db = await getServerDB();

    // Query by email or normalized_email (Better Auth may store in either)
    const [user] = await db
      .select({
        emailVerified: users.emailVerified,
        id: users.id,
      })
      .from(users)
      .where(or(eq(users.email, value), eq(users.normalizedEmail, value)))
      .limit(1);

    if (!user) {
      return NextResponse.json({ exists: false });
    }

    const accounts = await db
      .select({
        password: account.password,
        providerId: account.providerId,
      })
      .from(account)
      .where(and(eq(account.userId, user.id)));
    const hasPassword = accounts.some(
      (a) =>
        a.providerId === 'credential' && typeof a.password === 'string' && a.password.length > 0,
    );

    return NextResponse.json({
      exists: true,
      hasPassword,
    } satisfies CheckUserResponseData);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const cause = error instanceof Error && error.cause ? String(error.cause) : undefined;
    console.error('Error checking user existence:', message, cause ?? '', error);
    return NextResponse.json(
      {
        error: process.env.NODE_ENV === 'development' ? message : 'Internal server error',
        exists: false,
      },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

import { userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { serverDB } from '@/database/server';

/**
 * GET /api/user/token-limits — get current user's token limits
 * Returns: { tokenQuota: number, tokensUsed: number, remaining: number }
 */
export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    const userId = session?.user?.id;
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await serverDB
      .select({
        tokenQuota: userCodes.tokenQuota,
        tokensUsed: userCodes.tokensUsed,
      })
      .from(userCodes)
      .where(eq(userCodes.userId, userId))
      .limit(1);

    if (result.length === 0) {
      return NextResponse.json(
        {
          tokenQuota: 0,
          tokensUsed: 0,
          remaining: 0,
        },
        { status: 200 },
      );
    }

    const { tokenQuota, tokensUsed } = result[0];
    const remaining = Math.max(0, tokenQuota - tokensUsed);

    return NextResponse.json({
      tokenQuota,
      tokensUsed,
      remaining,
    });
  } catch (error) {
    console.error('Error fetching token limits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

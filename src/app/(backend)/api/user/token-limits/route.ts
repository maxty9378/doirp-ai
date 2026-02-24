import { DEFAULT_USER_TOKEN_QUOTA, userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { messages } from '@/database/schemas';
import { serverDB } from '@/database/server';

/**
 * Calculate total tokens used from messages metadata
 */
async function calculateTokensFromMessages(userId: string): Promise<number> {
  const userMessages = await serverDB
    .select({
      metadata: messages.metadata,
    })
    .from(messages)
    .where(eq(messages.userId, userId));

  let totalTokens = 0;
  for (const msg of userMessages) {
    const metadata = msg.metadata as {
      totalInputTokens?: number;
      totalOutputTokens?: number;
      totalTokens?: number;
    } | null;

    if (metadata) {
      const msgTokens =
        (metadata.totalTokens ?? 0) ||
        (metadata.totalInputTokens ?? 0) + (metadata.totalOutputTokens ?? 0);
      totalTokens += msgTokens;
    }
  }
  return totalTokens;
}

/**
 * GET /api/user/token-limits — get current user's token limits
 * Returns: { tokenQuota: number, tokensUsed: number, remaining: number }
 * 
 * If user has a userCodes entry, uses that quota/usage.
 * Otherwise, calculates usage from messages and uses default quota.
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

    // Check if user has a userCodes entry
    const result = await serverDB
      .select({
        tokenQuota: userCodes.tokenQuota,
        tokensUsed: userCodes.tokensUsed,
      })
      .from(userCodes)
      .where(eq(userCodes.userId, userId))
      .limit(1);

    let tokenQuota: number;
    let tokensUsed: number;

    if (result.length > 0) {
      // User has userCodes entry - use stored values
      tokenQuota = result[0].tokenQuota;
      tokensUsed = result[0].tokensUsed;
    } else {
      // No userCodes entry - calculate from messages, use default quota
      tokenQuota = DEFAULT_USER_TOKEN_QUOTA;
      tokensUsed = await calculateTokensFromMessages(userId);
    }

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

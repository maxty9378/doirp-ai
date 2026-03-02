import {
  DAILY_IMAGE_LIMIT,
  DEFAULT_USER_TOKEN_QUOTA,
  userCodes,
} from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { messages } from '@/database/schemas';
import { serverDB } from '@/database/server';
import { TOKEN_OVERDRAFT_LIMIT } from '@/server/middleware/trackTokenUsage';

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

    let result: Array<{
      dailyImageCount: number | null;
      lastImageDate: Date | null;
      tokenQuota: number;
      tokensUsed: number;
    }> = [];

    try {
      result = await serverDB
        .select({
          dailyImageCount: userCodes.dailyImageCount,
          lastImageDate: userCodes.lastImageDate,
          tokenQuota: userCodes.tokenQuota,
          tokensUsed: userCodes.tokensUsed,
        })
        .from(userCodes)
        .where(eq(userCodes.userId, userId))
        .limit(1);
    } catch (dbError) {
      // user_codes table may not exist yet (migrations not run)
      console.warn('token-limits: userCodes query failed, using defaults:', dbError);
    }

    let tokenQuota: number;
    let tokensUsed: number;
    let dailyImageCount = 0;

    if (result.length > 0) {
      tokenQuota = result[0].tokenQuota;
      tokensUsed = result[0].tokensUsed;
      // Lazy reset: only count today's images
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const lastDate = result[0].lastImageDate ? new Date(result[0].lastImageDate) : null;
      dailyImageCount =
        lastDate && lastDate >= todayStart ? (result[0].dailyImageCount ?? 0) : 0;
    } else {
      tokenQuota = DEFAULT_USER_TOKEN_QUOTA;
      try {
        tokensUsed = await calculateTokensFromMessages(userId);
      } catch {
        tokensUsed = 0;
      }
    }

    const remaining = tokenQuota - tokensUsed;

    return NextResponse.json({
      dailyImageCount,
      imageLimit: DAILY_IMAGE_LIMIT,
      overdraftLimit: TOKEN_OVERDRAFT_LIMIT,
      remaining,
      tokenQuota,
      tokensUsed,
    });
  } catch (error) {
    console.error('Error fetching token limits:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

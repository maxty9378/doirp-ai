import {
  DAILY_IMAGE_LIMIT,
  DEFAULT_USER_TOKEN_QUOTA,
  userCodes,
  users,
} from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL } from '@/const/admin';
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

    try {
      const [tokenResult, imageResult] = await Promise.all([
        serverDB
          .select({
            tokenQuota: userCodes.tokenQuota,
            tokensUsed: userCodes.tokensUsed,
          })
          .from(userCodes)
          .where(eq(userCodes.userId, userId))
          .limit(1),

        serverDB
          .select({
            dailyImageCount: users.dailyImageCount,
            lastImageDate: users.lastImageDate,
            role: users.role,
            email: users.email,
          })
          .from(users)
          .where(eq(users.id, userId))
          .limit(1),
      ]);

      // tokenResult can be empty if user_codes row is missing (migrations not run yet)
      // imageResult should also be empty then, but we treat it as 0 usage.
      const imageRow = imageResult[0] ?? null;
      const tokenRow = tokenResult[0] ?? null;

      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const nextResetStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

      const lastDate = imageRow?.lastImageDate ? new Date(imageRow.lastImageDate) : null;
      const dailyImageCount =
        lastDate && lastDate >= todayStart ? (imageRow?.dailyImageCount ?? 0) : 0;

      const isImageUnlimited =
        imageRow?.role === 'admin' ||
        (ADMIN_EMAIL &&
          imageRow?.email &&
          imageRow.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

      let tokenQuota: number;
      let tokensUsed: number;

      if (tokenRow) {
        tokenQuota = tokenRow.tokenQuota;
        tokensUsed = tokenRow.tokensUsed;
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
        isImageUnlimited,
        nextImageResetAt: nextResetStart.toISOString(),
        overdraftLimit: TOKEN_OVERDRAFT_LIMIT,
        remaining,
        tokenQuota,
        tokensUsed,
      });
    } catch (dbError) {
      // user_codes table may not exist yet (migrations not run)
      console.warn('token-limits: userCodes query failed, using defaults:', dbError);
    }

    // Fallback: if we couldn't query user_codes/users (e.g. migrations pending)
    // token-related defaults
    const tokenQuota = DEFAULT_USER_TOKEN_QUOTA;
    let tokensUsed: number;
    try {
      tokensUsed = await calculateTokensFromMessages(userId);
    } catch {
      tokensUsed = 0;
    }

    const remaining = tokenQuota - tokensUsed;
    const now = new Date();
    const nextResetStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    return NextResponse.json({
      dailyImageCount: 0,
      imageLimit: DAILY_IMAGE_LIMIT,
      isImageUnlimited: false,
      nextImageResetAt: nextResetStart.toISOString(),
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

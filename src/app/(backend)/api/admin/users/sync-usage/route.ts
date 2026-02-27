import { userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { messages } from '@/database/schemas';
import { serverDB } from '@/database/server';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';

async function ensureAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user as { email?: string; username?: string } | undefined;
  const byUsername = user?.username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!byUsername && !byEmail) return null;
  return session;
}

/**
 * POST /api/admin/users/sync-usage — sync token usage from messages metadata to userCodes
 * This recalculates tokensUsed for all users based on their actual message history
 */
export async function POST() {
  const session = await ensureAdmin();
  if (!session) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await ensureUserCodesSchema();

    // Get all user codes
    const allUserCodes = await serverDB
      .select({
        id: userCodes.id,
        userId: userCodes.userId,
        tokensUsed: userCodes.tokensUsed,
      })
      .from(userCodes);

    const results: Array<{
      userId: string;
      oldTokensUsed: number;
      newTokensUsed: number;
    }> = [];

    for (const userCode of allUserCodes) {
      // Calculate total tokens from messages metadata for this user
      const userMessages = await serverDB
        .select({
          metadata: messages.metadata,
        })
        .from(messages)
        .where(eq(messages.userId, userCode.userId));

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

      // Update userCodes with calculated total
      if (totalTokens !== userCode.tokensUsed) {
        await serverDB
          .update(userCodes)
          .set({
            tokensUsed: totalTokens,
            updatedAt: new Date(),
          })
          .where(eq(userCodes.id, userCode.id));

        results.push({
          userId: userCode.userId,
          oldTokensUsed: userCode.tokensUsed ?? 0,
          newTokensUsed: totalTokens,
        });
      }
    }

    return NextResponse.json({
      success: true,
      syncedUsers: results.length,
      details: results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error syncing token usage:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

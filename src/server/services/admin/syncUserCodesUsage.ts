import { userCodes } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';

import { messages } from '@/database/schemas';
import { serverDB } from '@/database/server';

/**
 * Recalculates tokensUsed for all user_codes from messages metadata.
 * Call before returning the users list so usage is always up to date.
 */
export async function syncUserCodesUsage(): Promise<{
  syncedCount: number;
}> {
  const allUserCodes = await serverDB
    .select({
      id: userCodes.id,
      userId: userCodes.userId,
      tokensUsed: userCodes.tokensUsed,
    })
    .from(userCodes);

  let syncedCount = 0;

  for (const userCode of allUserCodes) {
    const userMessages = await serverDB
      .select({ metadata: messages.metadata })
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

    if (totalTokens !== (userCode.tokensUsed ?? 0)) {
      await serverDB
        .update(userCodes)
        .set({ tokensUsed: totalTokens, updatedAt: new Date() })
        .where(eq(userCodes.id, userCode.id));
      syncedCount += 1;
    }
  }

  return { syncedCount };
}

import { TRPCError } from '@trpc/server';
import debug from 'debug';

import { serverDB } from '@/database/server';
import { userCodes } from '@/database/schemas';
import { eq } from 'drizzle-orm';

const log = debug('lobe:middleware:trackTokenUsage');

/**
 * Track token usage for user_codes
 * Updates tokens_used in user_codes table
 */
export async function trackTokenUsage(userId: string, tokensUsed: number) {
  if (!tokensUsed || tokensUsed <= 0) return;

  try {
    // Get user code entry
    const [userCode] = await serverDB
      .select({
        id: userCodes.id,
        tokensUsed: userCodes.tokensUsed,
        tokenQuota: userCodes.tokenQuota,
      })
      .from(userCodes)
      .where(eq(userCodes.userId, userId))
      .limit(1);

    if (!userCode) {
      log('No user_code found for userId:', userId);
      return;
    }

    const newTotal = (userCode.tokensUsed ?? 0) + tokensUsed;
    const quota = userCode.tokenQuota ?? 0;

    // Check if quota exceeded
    if (newTotal > quota) {
      log('User %s exceeded token quota: %d / %d', userId, newTotal, quota);
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Token quota exceeded. Used: ${newTotal}, Quota: ${quota}`,
      });
    }

    // Update tokens_used
    await serverDB
      .update(userCodes)
      .set({
        tokensUsed: newTotal,
        updatedAt: new Date(),
      })
      .where(eq(userCodes.id, userCode.id));

    log('Updated token usage for user %s: %d -> %d (quota: %d)', 
      userId, userCode.tokensUsed, newTotal, quota);

  } catch (error) {
    if (error instanceof TRPCError) throw error;
    log('Failed to track token usage:', error);
    // Don't throw - allow request to proceed even if tracking fails
  }
}

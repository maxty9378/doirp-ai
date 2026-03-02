import { TRPCError } from '@trpc/server';
import debug from 'debug';

import { serverDB } from '@/database/server';
import { userCodes } from '@/database/schemas';
import { eq } from 'drizzle-orm';

const log = debug('lobe:middleware:trackTokenUsage');

/** Maximum tokens allowed over quota (negative remaining) before blocking generation */
export const TOKEN_OVERDRAFT_LIMIT = 10_000;

/**
 * Check if user has remaining token balance before starting LLM call.
 * Throws TRPCError FORBIDDEN if balance <= 0 (no overdraft for pre-check).
 */
export async function checkTokenLimit(userId: string): Promise<void> {
  const [row] = await serverDB
    .select({
      tokenQuota: userCodes.tokenQuota,
      tokensUsed: userCodes.tokensUsed,
    })
    .from(userCodes)
    .where(eq(userCodes.userId, userId))
    .limit(1);

  if (!row) {
    log('No user_code for userId %s, allowing request', userId);
    return;
  }

  const remaining = (row.tokenQuota ?? 0) - (row.tokensUsed ?? 0);
  if (remaining <= 0) {
    log('User %s token balance exhausted: quota=%d used=%d', userId, row.tokenQuota, row.tokensUsed);
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Лимит токенов исчерпан. Обратитесь к администратору для пополнения.',
    });
  }
}

/**
 * Track token usage for user_codes.
 * Allows usage up to quota + TOKEN_OVERDRAFT_LIMIT; blocks beyond that.
 */
export async function trackTokenUsage(userId: string, tokensUsed: number) {
  if (!tokensUsed || tokensUsed <= 0) return;

  try {
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
    const maxAllowed = quota + TOKEN_OVERDRAFT_LIMIT;

    if (newTotal > maxAllowed) {
      log('User %s exceeded token quota (with overdraft): %d > %d', userId, newTotal, maxAllowed);
      throw new TRPCError({
        code: 'FORBIDDEN',
        message: `Token quota exceeded. Used: ${newTotal}, Quota: ${quota} (max overdraft: ${TOKEN_OVERDRAFT_LIMIT})`,
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

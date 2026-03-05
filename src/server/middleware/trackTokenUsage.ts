import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { eq } from 'drizzle-orm';

import { userCodes } from '@/database/schemas';
import { serverDB } from '@/database/server';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';

const log = debug('lobe:middleware:trackTokenUsage');

/** Maximum tokens allowed over quota (negative remaining) before blocking generation */
export const TOKEN_OVERDRAFT_LIMIT = 10_000;

function isTableMissingError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  const causeMsg = err instanceof Error && err.cause instanceof Error ? err.cause.message : '';
  return (
    msg.includes('Failed query') ||
    msg.includes('relation') ||
    msg.includes('does not exist') ||
    causeMsg.includes('user_codes') ||
    causeMsg.includes('does not exist')
  );
}

/**
 * Check if user has remaining token balance before starting LLM call.
 * Throws TRPCError FORBIDDEN if balance <= 0 (no overdraft for pre-check).
 * If table user_codes is missing, ensures schema once and retries (so migrations are optional).
 */
export async function checkTokenLimit(userId: string): Promise<void> {
  let row: { tokenQuota: number; tokensUsed: number } | undefined;
  let triedEnsure = false;

  while (true) {
    try {
      const [r] = await serverDB
        .select({
          tokenQuota: userCodes.tokenQuota,
          tokensUsed: userCodes.tokensUsed,
        })
        .from(userCodes)
        .where(eq(userCodes.userId, userId))
        .limit(1);
      row = r;
      break;
    } catch (err) {
      if (!triedEnsure && isTableMissingError(err)) {
        log('user_codes query failed (table missing?), ensuring schema and retrying: %O', err);
        triedEnsure = true;
        await ensureUserCodesSchema();
        continue;
      }
      log('checkTokenLimit failed: %O', err);
      throw err;
    }
  }

  if (!row) {
    log('No user_code for userId %s, allowing request', userId);
    return;
  }

  const remaining = (row.tokenQuota ?? 0) - (row.tokensUsed ?? 0);
  if (remaining <= 0) {
    log(
      'User %s token balance exhausted: quota=%d used=%d',
      userId,
      row.tokenQuota,
      row.tokensUsed,
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: 'Лимит токенов исчерпан. Обратитесь к администратору для пополнения.',
    });
  }
}

/**
 * Track token usage for user_codes.
 * Allows usage up to quota + TOKEN_OVERDRAFT_LIMIT; blocks beyond that.
 * If table user_codes is missing, ensures schema once and retries.
 */
export async function trackTokenUsage(userId: string, tokensUsed: number) {
  if (!tokensUsed || tokensUsed <= 0) return;

  let userCode: { id: string; tokensUsed: number; tokenQuota: number } | undefined;
  let triedEnsure = false;

  try {
    while (true) {
      try {
        const [row] = await serverDB
          .select({
            id: userCodes.id,
            tokensUsed: userCodes.tokensUsed,
            tokenQuota: userCodes.tokenQuota,
          })
          .from(userCodes)
          .where(eq(userCodes.userId, userId))
          .limit(1);
        userCode = row;
        break;
      } catch (err) {
        if (!triedEnsure && isTableMissingError(err)) {
          log('trackTokenUsage: user_codes query failed, ensuring schema and retrying: %O', err);
          triedEnsure = true;
          await ensureUserCodesSchema();
          continue;
        }
        throw err;
      }
    }
  } catch (error) {
    if (error instanceof TRPCError) throw error;
    log('Failed to track token usage:', error);
    return;
  }

  if (!userCode) {
    log('No user_code found for userId:', userId);
    return;
  }

  try {
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

    await serverDB
      .update(userCodes)
      .set({
        tokensUsed: newTotal,
        updatedAt: new Date(),
      })
      .where(eq(userCodes.id, userCode.id));

    log(
      'Updated token usage for user %s: %d -> %d (quota: %d)',
      userId,
      userCode.tokensUsed,
      newTotal,
      quota,
    );
  } catch (updateError) {
    if (updateError instanceof TRPCError) throw updateError;
    log('Failed to track token usage:', updateError);
  }
}

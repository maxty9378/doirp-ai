import { TRPCError } from '@trpc/server';
import debug from 'debug';

import { serverDB } from '@/database/server';
import { DAILY_IMAGE_LIMIT, userCodes } from '@/database/schemas';
import { eq } from 'drizzle-orm';

const log = debug('lobe:middleware:imageLimit');

/**
 * Check if user can generate `count` more images today (lazy reset).
 * If last_image_date is not today, daily_image_count is treated as 0.
 * Throws FORBIDDEN if daily_image_count + count > DAILY_IMAGE_LIMIT.
 */
export async function checkImageLimit(userId: string, count: number): Promise<void> {
  const [row] = await serverDB
    .select({
      dailyImageCount: userCodes.dailyImageCount,
      id: userCodes.id,
      lastImageDate: userCodes.lastImageDate,
    })
    .from(userCodes)
    .where(eq(userCodes.userId, userId))
    .limit(1);

  if (!row) {
    log('No user_code for userId %s, allowing image generation', userId);
    return;
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastDate = row.lastImageDate ? new Date(row.lastImageDate) : null;
  const lastWasToday = lastDate && lastDate >= todayStart;

  const currentCount = lastWasToday ? (row.dailyImageCount ?? 0) : 0;
  const afterCount = currentCount + count;

  if (afterCount > DAILY_IMAGE_LIMIT) {
    log(
      'User %s daily image limit exceeded: %d + %d > %d',
      userId,
      currentCount,
      count,
      DAILY_IMAGE_LIMIT,
    );
    throw new TRPCError({
      code: 'FORBIDDEN',
      message: `Дневной лимит картинок исчерпан (${currentCount}/${DAILY_IMAGE_LIMIT}). Лимит: ${DAILY_IMAGE_LIMIT} в день.`,
    });
  }
}

/**
 * Increment daily image count after successful generation (lazy reset + increment).
 * If last_image_date is not today, resets count to 0 then adds `count`.
 */
export async function incrementImageUsage(userId: string, count: number): Promise<void> {
  if (!count || count <= 0) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [row] = await serverDB
    .select({
      dailyImageCount: userCodes.dailyImageCount,
      id: userCodes.id,
      lastImageDate: userCodes.lastImageDate,
    })
    .from(userCodes)
    .where(eq(userCodes.userId, userId))
    .limit(1);

  if (!row) {
    log('No user_code for userId %s, skip increment', userId);
    return;
  }

  const lastDate = row.lastImageDate ? new Date(row.lastImageDate) : null;
  const lastWasToday = lastDate && lastDate >= todayStart;
  const newCount = lastWasToday ? (row.dailyImageCount ?? 0) + count : count;

  await serverDB
    .update(userCodes)
    .set({
      dailyImageCount: newCount,
      lastImageDate: now,
      updatedAt: now,
    })
    .where(eq(userCodes.id, row.id));

  log('Incremented image usage for user %s: %d (total today: %d)', userId, count, newCount);
}

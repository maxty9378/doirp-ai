import { TRPCError } from '@trpc/server';
import debug from 'debug';
import { eq } from 'drizzle-orm';

import { ADMIN_EMAIL } from '@/const/admin';
import { DAILY_IMAGE_LIMIT, users } from '@/database/schemas';
import { serverDB } from '@/database/server';

const log = debug('lobe:middleware:imageLimit');

/** Error code returned to client when daily image limit is reached. */
export const DAILY_IMAGE_LIMIT_REACHED = 'DAILY_IMAGE_LIMIT_REACHED';

/**
 * Check if user can generate `count` more images today (lazy reset by day).
 * Admin (role === 'admin') has unlimited access; others are limited to DAILY_IMAGE_LIMIT per day.
 * Throws TOO_MANY_REQUESTS (429) with DAILY_IMAGE_LIMIT_REACHED if limit exceeded.
 */
export async function checkImageLimit(userId: string, count: number): Promise<void> {
  const [row] = await serverDB
    .select({
      dailyImageCount: users.dailyImageCount,
      lastImageDate: users.lastImageDate,
      role: users.role,
      email: users.email,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    log('User not found for userId %s, allowing image generation', userId);
    return;
  }

  const isAdmin =
    row.role === 'admin' ||
    (ADMIN_EMAIL && row.email && row.email.toLowerCase() === ADMIN_EMAIL.toLowerCase());

  if (isAdmin) {
    log('Admin user %s, skipping image limit check', userId);
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
      code: 'TOO_MANY_REQUESTS',
      message: `Дневной лимит картинок исчерпан (${currentCount}/${DAILY_IMAGE_LIMIT}). Лимит: ${DAILY_IMAGE_LIMIT} в день.`,
    });
  }
}

/**
 * Increment daily image count after successful generation (lazy reset + increment).
 * Updates users.daily_image_count and users.last_image_date.
 * Call only after a generation has completed successfully (e.g. in async image route).
 */
export async function incrementImageUsage(userId: string, count: number): Promise<void> {
  if (!count || count <= 0) return;

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const [row] = await serverDB
    .select({
      dailyImageCount: users.dailyImageCount,
      lastImageDate: users.lastImageDate,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  if (!row) {
    log('User not found for userId %s, skip increment', userId);
    return;
  }

  const lastDate = row.lastImageDate ? new Date(row.lastImageDate) : null;
  const lastWasToday = lastDate && lastDate >= todayStart;
  const newCount = lastWasToday ? (row.dailyImageCount ?? 0) + count : count;

  await serverDB
    .update(users)
    .set({
      dailyImageCount: newCount,
      lastImageDate: now,
      updatedAt: now,
    })
    .where(eq(users.id, userId));

  log('Incremented image usage for user %s: %d (total today: %d)', userId, count, newCount);
}

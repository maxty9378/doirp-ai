import { userCodes, users } from '@lobechat/database/schemas';
import { and, eq, or, sql } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { serverDB } from '@/database/server';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';

const TRAINING_ONLY_ROLE = 'training_only';
const TRAINING_ONLY_ACCOUNT_TYPE = 'training-only';

export async function POST() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserCodesSchema();

    const userId = session.user.id;
    const [row] = await serverDB
      .select({
        accountType: userCodes.accountType,
        role: users.role,
        trainingSessionQuota: userCodes.trainingSessionQuota,
        trainingSessionsUsed: userCodes.trainingSessionsUsed,
      })
      .from(users)
      .leftJoin(userCodes, eq(userCodes.userId, users.id))
      .where(eq(users.id, userId))
      .limit(1);

    if (!row) {
      return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 });
    }

    const isTrainingOnly =
      row.role === TRAINING_ONLY_ROLE || row.accountType === TRAINING_ONLY_ACCOUNT_TYPE;

    if (!isTrainingOnly) {
      return NextResponse.json({ ok: true, message: 'Not training-only account' });
    }

    const quota = row.trainingSessionQuota;
    const used = row.trainingSessionsUsed ?? 0;

    if (!quota || quota <= 0 || used >= quota) {
      return NextResponse.json({ error: 'Лимит запусков исчерпан.' }, { status: 403 });
    }

    const [updated] = await serverDB
      .update(userCodes)
      .set({
        trainingSessionsUsed: sql`${userCodes.trainingSessionsUsed} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(userCodes.userId, userId),
          or(
            sql`${userCodes.trainingSessionQuota} IS NULL`,
            sql`${userCodes.trainingSessionsUsed} < ${userCodes.trainingSessionQuota}`,
          ),
        ),
      )
      .returning({
        trainingSessionQuota: userCodes.trainingSessionQuota,
        trainingSessionsUsed: userCodes.trainingSessionsUsed,
      });

    if (!updated) {
      return NextResponse.json({ error: 'Не удалось списать сессию.' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, trainingSessionsUsed: updated.trainingSessionsUsed });
  } catch (error) {
    console.error('[voice-call/deduct] failed:', error);
    return NextResponse.json({ error: 'Не удалось списать сессию' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

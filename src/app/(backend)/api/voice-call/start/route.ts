import { userCodes, users } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
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
      return NextResponse.json({ allowed: true });
    }

    const quota = row.trainingSessionQuota;
    const used = row.trainingSessionsUsed ?? 0;

    if (!quota || quota <= 0) {
      return NextResponse.json(
        { error: 'Для этой учётной записи не настроен лимит запусков тренажёра.' },
        { status: 403 },
      );
    }

    if (used >= quota) {
      return NextResponse.json(
        { error: 'Лимит запусков тренажёра исчерпан. Обратитесь к администратору.' },
        { status: 403 },
      );
    }

    return NextResponse.json({
      allowed: true,
      remaining: Math.max(0, (quota ?? 0) - used),
      trainingSessionQuota: quota,
      trainingSessionsUsed: used,
    });
  } catch (error) {
    console.error('[voice-call/start] failed:', error);
    return NextResponse.json({ error: 'Не удалось запустить тренажёр' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

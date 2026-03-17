import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { getTrainingScenarioByKey } from '@/server/services/training';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const key = searchParams.get('key');
  if (!key) {
    return NextResponse.json({ error: 'Параметр key обязателен' }, { status: 400 });
  }

  try {
    const scenario = await getTrainingScenarioByKey(key);
    if (!scenario) {
      return NextResponse.json({ error: 'Тренажёр не найден' }, { status: 404 });
    }

    return NextResponse.json({ scenario });
  } catch (error) {
    console.error('[training/scenario] failed to load:', error);
    return NextResponse.json({ error: 'Не удалось загрузить тренажёр' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { listTrainingScenarios } from '@/server/services/training';

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const scenarios = await listTrainingScenarios();
    return NextResponse.json({ scenarios });
  } catch (error) {
    console.error('[training/scenarios] failed to load:', error);
    // При ошибке БД (таблицы не созданы и т.п.) возвращаем пустой список — фронт покажет fallback-карточку GFD
    return NextResponse.json({ scenarios: [] });
  }
}

export const runtime = 'nodejs';

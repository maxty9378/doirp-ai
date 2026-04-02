import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { listAllTrainingScenarios, listTrainingScenarios } from '@/server/services/training';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { headers: { 'Cache-Control': 'no-store' }, status: 401 },
    );
  }

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';
  const headersByMode = includeInactive
    ? { 'Cache-Control': 'no-store' }
    : {
        'Cache-Control': 'private, max-age=120, stale-while-revalidate=600',
        Vary: 'Cookie',
      };

  try {
    const scenarios = includeInactive
      ? await listAllTrainingScenarios()
      : await listTrainingScenarios();
    return NextResponse.json({ scenarios }, { headers: headersByMode });
  } catch (error) {
    console.error('[training/scenarios] failed to load:', error);
    return NextResponse.json({ scenarios: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export const runtime = 'nodejs';

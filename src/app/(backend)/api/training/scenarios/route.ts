import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { listTrainingScenarios, listAllTrainingScenarios } from '@/server/services/training';

export async function GET(request: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const includeInactive = request.nextUrl.searchParams.get('includeInactive') === 'true';

  try {
    const scenarios = includeInactive
      ? await listAllTrainingScenarios()
      : await listTrainingScenarios();
    return NextResponse.json({ scenarios });
  } catch (error) {
    console.error('[training/scenarios] failed to load:', error);
    return NextResponse.json({ scenarios: [] });
  }
}

export const runtime = 'nodejs';

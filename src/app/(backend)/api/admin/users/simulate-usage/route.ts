import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { trackTokenUsage } from '@/server/middleware/trackTokenUsage';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';
import { getSessionAdminUser } from '@/server/utils/admin';

async function ensureAdmin() {
  return getSessionAdminUser();
}

export const POST = async (req: NextRequest) => {
  try {
    const admin = await ensureAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { userId, tokens } = await req.json();

    if (!userId || typeof tokens !== 'number' || tokens <= 0) {
      return NextResponse.json({ error: 'Invalid userId or tokens' }, { status: 400 });
    }

    await ensureUserCodesSchema();

    // Simulate token usage
    await trackTokenUsage(userId, tokens);

    return NextResponse.json({ success: true, tokensAdded: tokens });
  } catch (error: any) {
    console.error('Failed to simulate usage:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
};

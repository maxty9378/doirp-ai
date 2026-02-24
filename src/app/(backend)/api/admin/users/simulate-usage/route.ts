import { NextRequest, NextResponse } from 'next/server';

import { ensureAdmin } from '@/const/admin';
import { serverDB } from '@/database/server';
import { trackTokenUsage } from '@/server/middleware/trackTokenUsage';

export const POST = async (req: NextRequest) => {
  try {
    // Check admin permissions
    const adminResult = await ensureAdmin();
    if (!adminResult.success) {
      return NextResponse.json({ error: adminResult.error }, { status: 403 });
    }

    const { userId, tokens } = await req.json();

    if (!userId || typeof tokens !== 'number' || tokens <= 0) {
      return NextResponse.json({ error: 'Invalid userId or tokens' }, { status: 400 });
    }

    // Simulate token usage
    await trackTokenUsage(userId, tokens);

    return NextResponse.json({ success: true, tokensAdded: tokens });
  } catch (error: any) {
    console.error('Failed to simulate usage:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 },
    );
  }
};

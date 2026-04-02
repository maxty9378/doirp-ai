import { NextResponse } from 'next/server';

import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';
import { syncUserCodesUsage } from '@/server/services/admin/syncUserCodesUsage';
import { getSessionAdminUser } from '@/server/utils/admin';

async function ensureAdmin() {
  return getSessionAdminUser();
}

/**
 * POST /api/admin/users/sync-usage — sync token usage from messages metadata to userCodes.
 * GET /api/admin/users already runs sync automatically; this endpoint is for manual trigger.
 */
export async function POST() {
  const admin = await ensureAdmin();
  if (!admin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    await ensureUserCodesSchema();
    const { syncedCount } = await syncUserCodesUsage();
    return NextResponse.json({
      success: true,
      syncedUsers: syncedCount,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error('Error syncing token usage:', error);
    return NextResponse.json(
      { error: 'Internal server error', details: message },
      { status: 500 },
    );
  }
}

export const runtime = 'nodejs';

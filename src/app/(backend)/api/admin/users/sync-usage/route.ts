import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';
import { syncUserCodesUsage } from '@/server/services/admin/syncUserCodesUsage';

async function ensureAdmin() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const user = session?.user as { email?: string; username?: string } | undefined;
  const byUsername = user?.username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!byUsername && !byEmail) return null;
  return session;
}

/**
 * POST /api/admin/users/sync-usage — sync token usage from messages metadata to userCodes.
 * GET /api/admin/users already runs sync automatically; this endpoint is for manual trigger.
 */
export async function POST() {
  const session = await ensureAdmin();
  if (!session) {
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

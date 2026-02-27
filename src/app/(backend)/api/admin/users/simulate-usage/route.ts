import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { trackTokenUsage } from '@/server/middleware/trackTokenUsage';
import { ensureUserCodesSchema } from '@/server/services/admin/ensureUserCodesSchema';

async function ensureAdmin() {
  const { headers } = await import('next/headers');
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as { email?: string; username?: string } | undefined;
  const byUsername = user?.username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
  if (!byUsername && !byEmail) return null;
  return session;
}

export const POST = async (req: NextRequest) => {
  try {
    const session = await ensureAdmin();
    if (!session) {
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

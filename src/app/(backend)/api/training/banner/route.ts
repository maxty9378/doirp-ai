import { users, userSettings } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { NextResponse } from 'next/server';

import { TRAINING_TP_BANNER_URL } from '@/config/voiceCallTrainer';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

const TRAINING_TP_BANNER_KEY = 'trainingTpBannerUrl';

const readBannerFromGeneral = (general: unknown): string | null => {
  if (!general || typeof general !== 'object') return null;
  const value = (general as Record<string, unknown>)[TRAINING_TP_BANNER_KEY];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

export async function GET() {
  try {
    const adminByUsername = await serverDB.query.users.findFirst({
      columns: { id: true },
      where: eq(users.username, ADMIN_USERNAME),
    });

    const adminByEmail =
      ADMIN_EMAIL && !adminByUsername
        ? await serverDB.query.users.findFirst({
            columns: { id: true },
            where: eq(users.email, ADMIN_EMAIL.toLowerCase()),
          })
        : null;

    const adminId = adminByUsername?.id || adminByEmail?.id;

    if (!adminId) {
      return NextResponse.json({ url: TRAINING_TP_BANNER_URL });
    }

    const settings = await serverDB.query.userSettings.findFirst({
      columns: { general: true },
      where: eq(userSettings.id, adminId),
    });

    const dbUrl = readBannerFromGeneral(settings?.general);
    return NextResponse.json({ url: dbUrl || TRAINING_TP_BANNER_URL });
  } catch {
    return NextResponse.json({ url: TRAINING_TP_BANNER_URL });
  }
}

export const runtime = 'nodejs';

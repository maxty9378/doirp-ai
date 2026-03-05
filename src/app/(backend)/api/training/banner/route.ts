import { users, userSettings } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import {
  TRAINING_HN_BANNER_URL,
  TRAINING_TP_BANNER_URL,
} from '@/config/voiceCallTrainer';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

const TRAINING_TP_BANNER_KEY = 'trainingTpBannerUrl';
const TRAINING_HN_BANNER_KEY = 'trainingHnBannerUrl';

const BANNER_KEYS = {
  hn: { key: TRAINING_HN_BANNER_KEY, defaultUrl: TRAINING_HN_BANNER_URL },
  tp: { key: TRAINING_TP_BANNER_KEY, defaultUrl: TRAINING_TP_BANNER_URL },
} as const;

type BannerKey = keyof typeof BANNER_KEYS;

const readBannerFromGeneral = (general: unknown, bannerKey: string): string | null => {
  if (!general || typeof general !== 'object') return null;
  const value = (general as Record<string, unknown>)[bannerKey];
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
};

export async function GET(req: NextRequest) {
  try {
    const key = (req.nextUrl.searchParams.get('key') || 'tp') as BannerKey;
    const { key: storageKey, defaultUrl } = BANNER_KEYS[key] ?? BANNER_KEYS.tp;

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
      return NextResponse.json({ url: defaultUrl });
    }

    const settings = await serverDB.query.userSettings.findFirst({
      columns: { general: true },
      where: eq(userSettings.id, adminId),
    });

    const dbUrl = readBannerFromGeneral(settings?.general, storageKey);
    return NextResponse.json({ url: dbUrl || defaultUrl });
  } catch {
    const key = (req.nextUrl.searchParams.get('key') || 'tp') as BannerKey;
    const { defaultUrl } = BANNER_KEYS[key] ?? BANNER_KEYS.tp;
    return NextResponse.json({ url: defaultUrl });
  }
}

export const runtime = 'nodejs';

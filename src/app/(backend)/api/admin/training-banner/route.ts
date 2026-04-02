import { userSettings } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { type NextRequest, NextResponse } from 'next/server';

import { serverDB } from '@/database/server';
import { getPrimaryAdminId, getSessionAdminUser } from '@/server/utils/admin';

const TRAINING_TP_BANNER_KEY = 'trainingTpBannerUrl';
const TRAINING_HN_BANNER_KEY = 'trainingHnBannerUrl';

const isAllowedBannerUrl = (url: string): boolean => {
  if (!url) return false;
  return (
    url.startsWith('/webapi/') ||
    url.startsWith('/images/') ||
    url.startsWith('https://') ||
    url.startsWith('http://')
  );
};

async function ensureAdminSession() {
  return getSessionAdminUser();
}

export async function POST(req: NextRequest) {
  try {
    const admin = await ensureAdminSession();
    if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const url = typeof body?.url === 'string' ? body.url.trim() : '';
    const key = body?.key === 'hn' ? 'hn' : 'tp';
    const storageKey = key === 'hn' ? TRAINING_HN_BANNER_KEY : TRAINING_TP_BANNER_KEY;

    if (!isAllowedBannerUrl(url)) {
      return NextResponse.json({ error: 'Некорректный URL баннера' }, { status: 400 });
    }

    const primaryAdminId = await getPrimaryAdminId();
    const targetAdminIds = Array.from(
      new Set([admin.id, primaryAdminId].filter(Boolean)),
    ) as string[];

    for (const targetAdminId of targetAdminIds) {
      const current = await serverDB.query.userSettings.findFirst({
        columns: { general: true },
        where: eq(userSettings.id, targetAdminId),
      });

      const currentGeneral =
        current?.general && typeof current.general === 'object'
          ? (current.general as Record<string, unknown>)
          : {};

      const nextGeneral = {
        ...currentGeneral,
        [storageKey]: url,
      };

      await serverDB
        .insert(userSettings)
        .values({
          general: nextGeneral,
          id: targetAdminId,
        })
        .onConflictDoUpdate({
          set: { general: nextGeneral },
          target: userSettings.id,
        });
    }

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error('[training-banner] failed to save banner:', error);
    return NextResponse.json({ error: 'Не удалось сохранить баннер' }, { status: 500 });
  }
}

export const runtime = 'nodejs';

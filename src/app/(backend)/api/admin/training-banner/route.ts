import { users, userSettings } from '@lobechat/database/schemas';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { type NextRequest, NextResponse } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';

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
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  const user = session?.user as { email?: string; id?: string; username?: string } | undefined;
  const username = user?.username;
  const email = user?.email?.toLowerCase();
  const byUsername = username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase();
  if (!user?.id || (!byUsername && !byEmail)) return null;

  return user;
}

const getPrimaryAdminId = async () => {
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

    return adminByUsername?.id || adminByEmail?.id || null;
  } catch (error) {
    console.error('[training-banner] failed to resolve primary admin id:', error);
    return null;
  }
};

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

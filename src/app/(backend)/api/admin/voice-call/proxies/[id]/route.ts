import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionUser } from '@/server/utils/admin';
import { isAdminUser } from '@/helpers/isAdmin';
import { voiceCallProxies } from '@lobechat/database/schemas';

const ensureAdminSession = async () => {
  const user = await getSessionUser();
  const devBypass = process.env.NODE_ENV !== 'production';
  if (!user?.id) return null;
  if (!isAdminUser(user) && !devBypass) return null;
  return user;
};

const normalizeUrl = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const proxyId = typeof id === 'string' ? id.trim() : '';
  if (!proxyId) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    priority?: number;
    url?: string;
  };

  const patch: Partial<typeof voiceCallProxies.$inferInsert> = {};

  if (typeof body.enabled === 'boolean') patch.enabled = body.enabled ? 1 : 0;
  if (Number.isFinite(body.priority)) patch.priority = Math.trunc(body.priority as number);
  if (body.url !== undefined) {
    const url = normalizeUrl(body.url);
    if (!url) return NextResponse.json({ error: 'URL обязателен' }, { status: 400 });
    if (!/^https?:\/\//i.test(url) && !/^socks5:\/\//i.test(url) && !/^socks:\/\//i.test(url)) {
      return NextResponse.json(
        { error: 'URL должен начинаться с http://, https:// или socks5://' },
        { status: 400 },
      );
    }
    patch.url = url;
  }

  const [updated] = await serverDB
    .update(voiceCallProxies)
    .set(patch)
    .where(eq(voiceCallProxies.id, proxyId))
    .returning();

  if (!updated) return NextResponse.json({ error: 'Прокси не найден' }, { status: 404 });

  return NextResponse.json({ item: { ...updated, enabled: updated.enabled === 1 } });
}

export async function DELETE(_req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id } = await context.params;
  const proxyId = typeof id === 'string' ? id.trim() : '';
  if (!proxyId) return NextResponse.json({ error: 'Некорректный id' }, { status: 400 });

  const [deleted] = await serverDB.delete(voiceCallProxies).where(eq(voiceCallProxies.id, proxyId)).returning();
  if (!deleted) return NextResponse.json({ error: 'Прокси не найден' }, { status: 404 });

  return NextResponse.json({ ok: true });
}

export const runtime = 'nodejs';

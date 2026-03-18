import { asc, desc } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

import { auth } from '@/auth';
import { ADMIN_EMAIL, ADMIN_USERNAME } from '@/const/admin';
import { serverDB } from '@/database/server';
import { voiceCallProxies } from '@lobechat/database/schemas';

const ensureAdminSession = async () => {
  const session = await auth.api.getSession({ headers: await headers() });
  const user = session?.user as
    | { email?: string; id?: string; role?: string; username?: string; isAdmin?: boolean }
    | undefined;
  const username = user?.username;
  const email = user?.email?.toLowerCase();
  const byUsername = username === ADMIN_USERNAME;
  const byEmail = ADMIN_EMAIL && email === ADMIN_EMAIL.toLowerCase();
  const byRole = user?.role === 'admin' || user?.isAdmin === true;

  // In dev, allow any signed-in user to manage proxy list
  const devBypass = process.env.NODE_ENV !== 'production';

  if (!user?.id || (!byUsername && !byEmail && !byRole && !devBypass)) return null;
  return user;
};

const normalizeUrl = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const coerceProxyUrl = (raw: string) => {
  const v = raw.trim();
  if (!v) return v;
  if (v.includes('://')) return v;

  // Accept common proxy formats:
  // - HOST:PORT
  // - HOST:PORT:USER:PASS
  const withAuth = v.match(/^([^:\s]+):(\d{2,5}):([^:\s]+):([^:\s]+)$/);
  if (withAuth) {
    const [, host, port, user, pass] = withAuth;
    return `http://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}`;
  }

  const hostPort = v.match(/^([^:\s]+):(\d{2,5})$/);
  if (hostPort) {
    const [, host, port] = hostPort;
    return `http://${host}:${port}`;
  }

  return v;
};

export async function GET() {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const rows = await serverDB
    .select()
    .from(voiceCallProxies)
    .orderBy(asc(voiceCallProxies.priority), desc(voiceCallProxies.createdAt));

  return NextResponse.json({
    items: rows.map((r) => ({
      ...r,
      enabled: r.enabled === 1,
      lastCheckOk: r.lastCheckOk === null ? null : r.lastCheckOk === 1,
    })),
  });
}

export async function POST(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    priority?: number;
    url?: string;
  };

  const url = coerceProxyUrl(normalizeUrl(body.url));
  if (!url) return NextResponse.json({ error: 'URL обязателен' }, { status: 400 });
  if (!/^https?:\/\//i.test(url) && !/^socks5:\/\//i.test(url) && !/^socks:\/\//i.test(url)) {
    return NextResponse.json(
      {
        error:
          'Неверный формат прокси. Используйте http(s)://USER:PASS@HOST:PORT, socks5://HOST:PORT или HOST:PORT(:USER:PASS)',
      },
      { status: 400 },
    );
  }

  const enabled = body.enabled === false ? 0 : 1;
  const priority = Number.isFinite(body.priority) ? Math.trunc(body.priority as number) : 1000;

  const [created] = await serverDB
    .insert(voiceCallProxies)
    .values({
      url,
      enabled,
      priority,
    })
    .returning();

  return NextResponse.json({
    item: { ...created, enabled: created.enabled === 1 },
  });
}

export const runtime = 'nodejs';


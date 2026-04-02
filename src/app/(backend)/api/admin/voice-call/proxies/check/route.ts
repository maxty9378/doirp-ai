import { eq } from 'drizzle-orm';
import { NextResponse, type NextRequest } from 'next/server';

import { serverDB } from '@/database/server';
import { getSessionUser } from '@/server/utils/admin';
import { isAdminUser } from '@/helpers/isAdmin';
import { voiceCallProxies } from '@lobechat/database/schemas';
import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';

const ensureAdminSession = async () => {
  const user = await getSessionUser();
  const devBypass = process.env.NODE_ENV !== 'production';
  if (!user?.id) return null;
  if (!isAdminUser(user) && !devBypass) return null;
  return user;
};

const CHECK_TARGET_URL = 'https://www.google.com/generate_204';
const CHECK_TIMEOUT_MS = 8000;

const createAgent = (proxyUrl: string) => {
  if (proxyUrl.startsWith('socks')) return new SocksProxyAgent(proxyUrl);
  return new HttpsProxyAgent(proxyUrl);
};

const safeJson = async (res: Response) => {
  const txt = await res.text().catch(() => '');
  try {
    return JSON.parse(txt) as any;
  } catch {
    return { raw: txt };
  }
};

export async function POST(req: NextRequest) {
  const admin = await ensureAdminSession();
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { ids?: string[] };
  const ids = Array.isArray(body.ids) ? body.ids.filter((x) => typeof x === 'string' && x.trim()) : null;

  const all = await serverDB.select().from(voiceCallProxies);
  const targets = ids ? all.filter((r) => ids.includes(r.id)) : all;

  const results: Array<{ id: string; ok: boolean; latencyMs?: number; error?: string }> = [];

  for (const p of targets) {
    const startedAt = Date.now();
    let ok = false;
    let latencyMs: number | undefined;
    let error: string | undefined;

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), CHECK_TIMEOUT_MS);

      const res = await fetch(CHECK_TARGET_URL, {
        method: 'GET',
        agent: createAgent(p.url),
        signal: controller.signal as any,
      } as any);

      clearTimeout(timer);
      latencyMs = Date.now() - startedAt;
      ok = res.ok;
      if (!ok) {
        const info = await safeJson(res as any);
        error = typeof info?.error === 'string' ? info.error : `HTTP ${res.status}`;
      }
    } catch (e) {
      latencyMs = Date.now() - startedAt;
      ok = false;
      error = e instanceof Error ? e.message : 'Ошибка проверки';
    }

    results.push({ id: p.id, ok, latencyMs, error });

    await serverDB
      .update(voiceCallProxies)
      .set({
        lastCheckAt: new Date(),
        lastCheckOk: ok ? 1 : 0,
        lastCheckError: ok ? null : error || 'Ошибка проверки',
        lastCheckLatencyMs: latencyMs ?? null,
      })
      .where(eq(voiceCallProxies.id, p.id));
  }

  return NextResponse.json({ items: results });
}

export const runtime = 'nodejs';

import { HttpsProxyAgent } from 'https-proxy-agent';
import fetch, { type RequestInit, type Response } from 'node-fetch';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { serverDB } from '@/database/server';
import { voiceCallProxies } from '@lobechat/database/schemas';
import { eq, asc } from 'drizzle-orm';

/**
 * Дополнительные прокси для REST-вызовов Gemini (generateContent и т.д.), если прямой запрос
 * режется по региону. Формат: через запятую, перевод строки или `;` — либо полный URL
 * `http://user:pass@host:port`, либо строка `host:port:user:pass`.
 * Первым в цепочке идёт HTTPS_PROXY / HTTP_PROXY из окружения (если задан).
 */
const ENV_FALLBACK_PROXIES = 'VOICE_CALL_HTTP_PROXY_FALLBACKS';

const FALLBACK_PROXY_LIST = [
  '31.59.20.176:6754:xlvhmzvz:fdtx2d20nj7f',
  '23.95.150.145:6114:xlvhmzvz:fdtx2d20nj7f',
  '198.23.239.134:6540:xlvhmzvz:fdtx2d20nj7f',
  '45.38.107.97:6014:xlvhmzvz:fdtx2d20nj7f',
  '107.172.163.27:6543:xlvhmzvz:fdtx2d20nj7f',
  '198.105.121.200:6462:xlvhmzvz:fdtx2d20nj7f',
  '64.137.96.74:6641:xlvhmzvz:fdtx2d20nj7f',
  '216.10.27.159:6837:xlvhmzvz:fdtx2d20nj7f',
  '142.111.67.146:5611:xlvhmzvz:fdtx2d20nj7f',
  '191.96.254.138:6185:xlvhmzvz:fdtx2d20nj7f',
];

function parseProxyEntry(entry: string): string {
  const parts = entry.trim().split(':');
  if (parts.length < 4) return '';
  const [host, port, user, ...passParts] = parts;
  const password = passParts.join(':');
  return `http://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

function parseFallbackToken(token: string): string | null {
  const t = token.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const fromColon = parseProxyEntry(t);
  return fromColon || null;
}

async function buildProxyUrls(): Promise<string[]> {
  const envProxy =
    process.env.HTTPS_PROXY ||
    process.env.https_proxy ||
    process.env.HTTP_PROXY ||
    process.env.http_proxy;
  const raw = process.env[ENV_FALLBACK_PROXIES] ?? '';
  const tokens = raw.split(/[\n,;]+/).map((s) => s.trim()).filter(Boolean);
  const fallback = tokens.map(parseFallbackToken).filter((u): u is string => Boolean(u));
  const defaultFallback = FALLBACK_PROXY_LIST.map(parseProxyEntry).filter(Boolean);

  let dbProxies: string[] = [];
  try {
    const list = await serverDB
      .select({ url: voiceCallProxies.url })
      .from(voiceCallProxies)
      .where(eq(voiceCallProxies.enabled, 1))
      .orderBy(asc(voiceCallProxies.priority), asc(voiceCallProxies.createdAt));
    dbProxies = list.map((p) => p.url).filter(Boolean);
  } catch (err) {
    console.error('[proxyFetch] Failed to load proxies from DB:', err);
  }

  const seen = new Set<string>();
  const out: string[] = [];
  const push = (url?: string | null) => {
    if (!url?.trim()) return;
    const u = url.trim();
    if (seen.has(u)) return;
    seen.add(u);
    out.push(u);
  };

  push(envProxy);
  for (const u of dbProxies) push(u);
  for (const u of fallback) push(u);
  for (const u of defaultFallback) push(u);
  return out;
}

function agentForUrl(
  url: string,
): InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> {
  if (url.startsWith('socks')) return new SocksProxyAgent(url);
  return new HttpsProxyAgent(url);
}

/** Блокировка по региону/гео в ответе Google Generative Language API. */
async function responseLooksLikeGeoBlocked(res: Response): Promise<boolean> {
  if (res.status === 451) return true;
  if (res.status !== 403 && res.status !== 400) return false;
  const data = (await res.clone().json().catch(() => ({}))) as { error?: { message?: string } };
  const msg = data?.error?.message ?? '';
  return /location|region|not supported|restricted|country|geo/i.test(msg);
}

/**
 * Fetch с fallback через прокси при гео-блоке или сетевой ошибке прямого запроса.
 * 1. Прямой запрос.
 * 2. Если ошибка не гео — возвращаем ответ как есть (тело не потреблено, кроме clone при 403).
 * 3. Если гео или исключение при прямом — перебор прокси из env.
 */
export async function proxyFetch(url: string, options: RequestInit): Promise<Response> {
  let lastResponse: Response | null = null;

  try {
    const direct = await fetch(url, options);
    lastResponse = direct;
    if (direct.ok) return direct;
    if (!(await responseLooksLikeGeoBlocked(direct))) return direct;
    console.warn('[proxyFetch] Прямой запрос заблокирован по региону, пробуем прокси…');
  } catch (err) {
    console.warn('[proxyFetch] Прямой запрос не удался, пробуем прокси…', (err as Error).message);
  }

  const proxyUrls = await buildProxyUrls();
  if (!proxyUrls.length) {
    if (lastResponse) return lastResponse;
    throw new Error('Прокси не настроены (HTTPS_PROXY / VOICE_CALL_HTTP_PROXY_FALLBACKS), прямой запрос не удался');
  }

  let lastError: unknown;

  for (let i = 0; i < proxyUrls.length; i++) {
    const proxyUrl = proxyUrls[i];
    const masked = proxyUrl.replace(/:[^:@]+@/, ':****@');
    try {
      console.log(`[proxyFetch] Прокси ${i + 1}/${proxyUrls.length}: ${masked}`);
      const agent = agentForUrl(proxyUrl);
      const res = await fetch(url, { ...options, agent } as any);

      lastResponse = res;
      if (res.ok) return res;
      if (!(await responseLooksLikeGeoBlocked(res))) return res;
      console.warn(`[proxyFetch] Прокси ${i + 1} тоже вернул гео-блок, следующий…`);
    } catch (err) {
      lastError = err;
      console.warn(`[proxyFetch] Прокси ${i + 1} ошибка:`, (err as Error).message);
    }
  }

  if (lastResponse) return lastResponse;
  throw lastError instanceof Error ? lastError : new Error('Все прокси исчерпаны');
}

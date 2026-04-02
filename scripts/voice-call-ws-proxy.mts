#!/usr/bin/env bun
/**
 * WebSocket-прокси для голосового звонка (Gemini Live).
 * Принимает подключения от браузера и проксирует их к Google через HTTPS_PROXY или SOCKS.
 * Запуск: VOICE_CALL_WS_PROXY_PORT=3011 bun run scripts/voice-call-ws-proxy.mts
 * В .env задайте HTTPS_PROXY (или HTTP_PROXY): http://USER:PASS@HOST:PORT или socks5://USER:PASS@HOST:PORT
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { asc, desc, eq } from 'drizzle-orm';

// import { serverDB } from '../src/database/server';
// import { voiceCallProxies } from '../src/database/schemas/voiceCallProxies';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PORT = Number(process.env.VOICE_CALL_WS_PROXY_PORT || '3011');

/** Список прокси host:port:user:pass; при отсутствии HTTPS_PROXY используется первый */
const FALLBACK_PROXY_LIST = [
  '95.81.98.243:20818:gemini:gBOiFtedtz2SHEVNtTqi',
  '31.59.20.176:6754:cddtxqdm:kcqr3pqna7ja',
  '23.95.150.145:6114:cddtxqdm:kcqr3pqna7ja',
  '198.23.239.134:6540:cddtxqdm:kcqr3pqna7ja',
  '45.38.107.97:6014:cddtxqdm:kcqr3pqna7ja',
  '107.172.163.27:6543:cddtxqdm:kcqr3pqna7ja',
  '198.105.121.200:6462:cddtxqdm:kcqr3pqna7ja',
  '216.10.27.159:6837:cddtxqdm:kcqr3pqna7ja',
  '142.111.67.146:5611:cddtxqdm:kcqr3pqna7ja',
  '191.96.254.138:6185:cddtxqdm:kcqr3pqna7ja',
  '31.58.9.4:6077:cddtxqdm:kcqr3pqna7ja',
];

function parseProxyEntry(entry: string): string {
  const parts = entry.trim().split(':');
  if (parts.length < 4) return '';
  const [host, port, user, ...passParts] = parts;
  const password = passParts.join(':');
  return `socks5h://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}`;
}

const envProxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

function ensureProxyUrl(url: string): string {
  const u = url.trim();
  if (!u) return '';
  if (u.startsWith('http://') || u.startsWith('https://')) {
    return u.replace(/^https?:\/\//, 'socks5h://');
  }
  if (u.startsWith('socks5://')) {
    return u.replace('socks5://', 'socks5h://');
  }
  return u;
}

// const fallbackUrls = FALLBACK_PROXY_LIST.map(parseProxyEntry).filter(Boolean);
/** Список URL прокси для перебора (при отказе Google по региону пробуем следующий) */
let PROXY_URLS: string[] = envProxy?.trim()
  ? [ensureProxyUrl(envProxy.trim())]
  : [];

function mergeUniqueProxyUrls(urls: Array<string | null | undefined>): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of urls) {
    const normalized = typeof item === 'string' ? item.trim() : '';
    if (!normalized || seen.has(normalized)) continue;
    const finalUrl = ensureProxyUrl(normalized);
    if (!finalUrl || seen.has(finalUrl)) continue;
    seen.add(finalUrl);
    result.push(finalUrl);
  }
  return result;
}

async function loadProxyUrlsFromDb(): Promise<string[]> {
  try {
    const rows = await serverDB
      .select()
      .from(voiceCallProxies)
      .where(eq(voiceCallProxies.enabled, 1))
      .orderBy(asc(voiceCallProxies.priority), desc(voiceCallProxies.createdAt));

    return rows.map((r) => (typeof r.url === 'string' ? r.url.trim() : '')).filter(Boolean);
  } catch {
    // DB может быть не настроена (например, запуск на VPS без DATABASE_URL) — тогда используем fallback
    return [];
  }
}

function getProxyAgentForUrl(
  url: string,
): InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> | undefined {
  if (!url?.trim()) return undefined;
  let u = url.trim();

  // Возвращаем принудительное использование socks5h для обхода утечек DNS
  if (u.startsWith('socks5://') || u.startsWith('http://') || u.startsWith('https://')) {
    u = u.replace(/^(socks5|https?):\/\//, 'socks5h://');
  }

  if (u.startsWith('socks')) return new SocksProxyAgent(u);
  return new HttpsProxyAgent(u);
}

function isRetriableCloseReason(reason: string, code: number): boolean {
  const r = reason.toLowerCase();
  return (
    code === 1006 ||
    code === 1007 ||
    code === 1008 ||
    /location|region|not supported|restricted|country|geo/i.test(r) ||
    /connection ended|connection closed|econnreset|socket hang up|network/i.test(r) ||
    r.includes('403') ||
    r.length === 0
  );
}

process.on('uncaughtException', (err) => {
  console.error('[voice-call-ws-proxy] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason, promise) => {
  console.error('[voice-call-ws-proxy] Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = http.createServer((req, res) => {
  console.log(`[voice-call-ws-proxy] HTTP request: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Voice call WebSocket proxy. Connect via WebSocket with ?key=YOUR_GOOGLE_API_KEY');
});

const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
  console.log(`[voice-call-ws-proxy] New client connection from ${req.socket.remoteAddress}`);
  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  const key = url?.searchParams.get('key');
  if (!key) {
    clientWs.close(4000, 'Missing key');
    return;
  }


  const upstreamUrl = `${GEMINI_LIVE_WS}?key=${encodeURIComponent(key)}`;
  const clientToUpstreamBuffer: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];
  const currentUpstreamRef: { current: WebSocket | null } = { current: null };

  const toBuffer = (data: Buffer | ArrayBuffer | Buffer[]): Buffer => {
    if (Buffer.isBuffer(data)) return data;
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.alloc(0);
  };

  clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const up = currentUpstreamRef.current;
    const buf = toBuffer(data);
    if (up?.readyState === WebSocket.OPEN) {
      console.log(`[voice-call-ws-proxy] client -> upstream (${buf.length} bytes, isBinary=${isBinary})`);
      try {
        up.send(buf);
      } catch (err) {
        console.error('[voice-call-ws-proxy] Send error:', err);
      }
    } else {
      clientToUpstreamBuffer.push({ data: buf, isBinary });
    }
  });
  clientWs.on('close', () => {
    console.log('[voice-call-ws-proxy] Client disconnected');
    currentUpstreamRef.current?.removeAllListeners();
    currentUpstreamRef.current?.close();
    currentUpstreamRef.current = null;
  });
  clientWs.on('error', (err) => {
    console.error('[voice-call-ws-proxy] Client error:', err);
    currentUpstreamRef.current?.close();
  });

  function tryUpstream(proxyIndex: number) {
    if (clientWs.readyState !== WebSocket.OPEN) return;
    if (proxyIndex >= PROXY_URLS.length) {
      console.error('[voice-call-ws-proxy] All proxies tried, giving up');
      clientWs.close(1011, 'Все прокси недоступны для Live API');
      return;
    }
    const proxyUrlToUse = PROXY_URLS[proxyIndex];
    const agent = getProxyAgentForUrl(proxyUrlToUse);
    const masked = proxyUrlToUse.replace(/:[^:@]+@/, ':****@');
    console.log(
      `[voice-call-ws-proxy] Trying upstream via proxy ${proxyIndex + 1}/${PROXY_URLS.length}: ${masked}`,
    );

    const upstream = new WebSocket(upstreamUrl, {
      agent,
      handshakeTimeout: 25_000,
      headers: {
        'Origin': 'https://aistudio.google.com',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    upstream.on('unexpected-response', (req, res) => {
      console.error(`[voice-call-ws-proxy] Google rejected with status: ${res.statusCode}`);
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => console.error(`[voice-call-ws-proxy] Response body: ${data}`));
    });

    upstream.on('open', () => {
      currentUpstreamRef.current = upstream;
      console.log(`[voice-call-ws-proxy] Upstream connected (proxy ${proxyIndex + 1})`);

      // Отправляем накопленный буфер. Используем setTimeout(0), чтобы не блокировать текущий цикл.
      setTimeout(() => {
        if (upstream.readyState !== WebSocket.OPEN) return;
        for (const { data, isBinary } of clientToUpstreamBuffer) {
          const buf = toBuffer(data);
          console.log(
            `[voice-call-ws-proxy] client -> upstream buffered (${buf.length} bytes, isBinary=${isBinary})`,
          );
          try {
            upstream.send(buf);
          } catch (err) {
            console.error('[voice-call-ws-proxy] Buffered send error:', err);
          }
        }
      }, 0);
    });

    upstream.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const buf = toBuffer(data);
      console.log(
        `[voice-call-ws-proxy] upstream -> client (${buf.length} bytes, isBinary=${isBinary})`,
      );
      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(buf);
        }
      } catch (err) {
        console.error('[voice-call-ws-proxy] Upstream response error:', err);
      }
    });

    upstream.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString?.() || '';
      console.log(
        `[voice-call-ws-proxy] Upstream closed (proxy ${proxyIndex + 1}):`,
        code,
        reasonStr || '(no reason)',
      );
      const shouldRetry = isRetriableCloseReason(reasonStr, code) && proxyIndex + 1 < PROXY_URLS.length;
      if (currentUpstreamRef.current === upstream) currentUpstreamRef.current = null;
      upstream.removeAllListeners();
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (shouldRetry) {
        tryUpstream(proxyIndex + 1);
      } else {
        clientWs.close(code, reasonStr || undefined);
      }
    });

    upstream.on('error', (err) => {
      console.error(`[voice-call-ws-proxy] Upstream error (proxy ${proxyIndex + 1}):`, err.message);
      if (currentUpstreamRef.current === upstream) currentUpstreamRef.current = null;
      upstream.removeAllListeners();
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (proxyIndex + 1 < PROXY_URLS.length) {
        tryUpstream(proxyIndex + 1);
      } else {
        clientWs.close(1011, 'Upstream error');
      }
    });
  }

  tryUpstream(0);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[voice-call-ws-proxy] Listening on ws://0.0.0.0:${PORT}`);
  void loadProxyUrlsFromDb().then((dbUrls) => {
    if (!dbUrls.length) {
      if (PROXY_URLS.length)
        console.log(
          `[voice-call-ws-proxy] Using ${PROXY_URLS.length} proxy/proxies (will try next on location error)`,
        );
      else console.warn('[voice-call-ws-proxy] No proxies set — upstream will connect directly');
    } else {
      const dedupedDb = Array.from(new Set(dbUrls));
      // Важно: при наличии прокси из БД даём им приоритет перед env/fallback.
      const merged = mergeUniqueProxyUrls([...dedupedDb, envProxy?.trim(), ...fallbackUrls]);
      PROXY_URLS = merged;
      console.log(
        `[voice-call-ws-proxy] Loaded ${dedupedDb.length} proxy/proxies from DB (total: ${PROXY_URLS.length})`,
      );
    }
  });
});

#!/usr/bin/env bun
/**
 * WebSocket proxy for Gemini Live voice calls.
 * Accepts browser connections and proxies them to Google via HTTPS/SOCKS proxies.
 * Start: VOICE_CALL_WS_PROXY_PORT=3011 bun run scripts/voice-call-ws-proxy.mts
 */

import { asc, desc, eq } from 'drizzle-orm';
import { HttpsProxyAgent } from 'https-proxy-agent';
import http from 'node:http';
import { SocksProxyAgent } from 'socks-proxy-agent';
import WebSocket, { WebSocketServer } from 'ws';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PORT = Number(process.env.VOICE_CALL_WS_PROXY_PORT || '3011');
const SERVER_GOOGLE_API_KEY = process.env.GOOGLE_API_KEY?.trim() || '';
const REMOTE_KEY_URLS = (process.env.VOICE_CALL_PROXY_KEY_URL || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const REMOTE_KEY_SHARED_SECRET = process.env.VOICE_CALL_PROXY_SHARED_SECRET?.trim() || '';
const REMOTE_KEY_CACHE_TTL_MS = Math.max(
  0,
  Number.parseInt(process.env.VOICE_CALL_PROXY_KEY_CACHE_TTL_MS || '0', 10) || 0,
);
const CLIENT_PROXY_PLACEHOLDER_KEY = 'voice-call-proxy';

/** host:port:user:pass fallback proxy list */
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
  const normalized = url.trim();
  if (!normalized) return '';

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return normalized.replace(/^https?:\/\//, 'socks5h://');
  }

  if (normalized.startsWith('socks5://')) {
    return normalized.replace('socks5://', 'socks5h://');
  }

  return normalized;
}

const fallbackUrls = FALLBACK_PROXY_LIST.map(parseProxyEntry).filter(Boolean);

/** Proxy URLs to try in order. */
let PROXY_URLS: string[] = envProxy?.trim() ? [ensureProxyUrl(envProxy.trim())] : [];
let cachedRemoteGoogleApiKey:
  | {
      expiresAt: number;
      value: string;
    }
  | null = null;
let remoteGoogleApiKeyPromise: Promise<string> | null = null;

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
    const [{ serverDB }, { voiceCallProxies }] = await Promise.all([
      import('../packages/database/src/server'),
      import('../packages/database/src/schemas/voiceCallProxy'),
    ]);

    const rows = await serverDB
      .select()
      .from(voiceCallProxies)
      .where(eq(voiceCallProxies.enabled, 1))
      .orderBy(asc(voiceCallProxies.priority), desc(voiceCallProxies.createdAt));

    return rows.map((row) => (typeof row.url === 'string' ? row.url.trim() : '')).filter(Boolean);
  } catch {
    return [];
  }
}

function getProxyAgentForUrl(
  url: string,
): InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> | undefined {
  if (!url?.trim()) return undefined;

  let normalized = url.trim();

  // Force socks5h to avoid DNS leaks on the proxy host.
  if (
    normalized.startsWith('socks5://') ||
    normalized.startsWith('http://') ||
    normalized.startsWith('https://')
  ) {
    normalized = normalized.replace(/^(socks5|https?):\/\//, 'socks5h://');
  }

  if (normalized.startsWith('socks')) return new SocksProxyAgent(normalized);
  return new HttpsProxyAgent(normalized);
}

function isRetriableCloseReason(reason: string, code: number): boolean {
  const normalized = reason.toLowerCase();

  return (
    code === 1006 ||
    code === 1007 ||
    code === 1008 ||
    /location|region|not supported|restricted|country|geo/i.test(normalized) ||
    /connection ended|connection closed|econnreset|socket hang up|network/i.test(normalized) ||
    normalized.includes('403') ||
    normalized.length === 0
  );
}

function clearRemoteGoogleApiKeyCache() {
  cachedRemoteGoogleApiKey = null;
}

function hasUsableClientKey(key: string) {
  return !!key && key !== CLIENT_PROXY_PLACEHOLDER_KEY;
}

async function fetchGoogleApiKeyFromApp(): Promise<string> {
  const now = Date.now();
  if (cachedRemoteGoogleApiKey && cachedRemoteGoogleApiKey.expiresAt > now) {
    return cachedRemoteGoogleApiKey.value;
  }

  if (!REMOTE_KEY_URLS.length || !REMOTE_KEY_SHARED_SECRET) return '';
  if (remoteGoogleApiKeyPromise) return remoteGoogleApiKeyPromise;

  remoteGoogleApiKeyPromise = (async () => {
    try {
      for (const remoteKeyUrl of REMOTE_KEY_URLS) {
        const response = await fetch(remoteKeyUrl, {
          headers: {
            Authorization: `Bearer ${REMOTE_KEY_SHARED_SECRET}`,
            'Cache-Control': 'no-store',
            Pragma: 'no-cache',
          },
          method: 'GET',
        }).catch((error) => {
          console.error(
            `[voice-call-ws-proxy] Remote key fetch error from ${remoteKeyUrl}:`,
            error,
          );
          return null;
        });

        if (!response) continue;

        if (!response.ok) {
          const errorText = await response.text().catch(() => '');
          console.error(
            `[voice-call-ws-proxy] Remote key fetch failed from ${remoteKeyUrl}: HTTP ${response.status}${errorText ? ` ${errorText.slice(0, 200)}` : ''}`,
          );
          continue;
        }

        const payload = (await response.json().catch(() => null)) as { apiKey?: string } | null;
        const apiKey = payload?.apiKey?.trim() || '';
        if (!apiKey) {
          console.error(
            `[voice-call-ws-proxy] Remote key fetch from ${remoteKeyUrl} returned an empty apiKey`,
          );
          continue;
        }

        cachedRemoteGoogleApiKey = {
          expiresAt: Date.now() + REMOTE_KEY_CACHE_TTL_MS,
          value: apiKey,
        };

        return apiKey;
      }
    } catch (error) {
      console.error('[voice-call-ws-proxy] Remote key fetch error:', error);
    } finally {
      remoteGoogleApiKeyPromise = null;
    }

    return '';
  })();

  return remoteGoogleApiKeyPromise;
}

async function resolveGoogleApiKey(url: URL | null) {
  const queryKey = url?.searchParams.get('key')?.trim() || '';
  if (hasUsableClientKey(queryKey)) {
    return { key: queryKey, source: 'query' as const };
  }

  if (SERVER_GOOGLE_API_KEY) {
    return { key: SERVER_GOOGLE_API_KEY, source: 'env' as const };
  }

  const remoteKey = await fetchGoogleApiKeyFromApp();
  if (remoteKey) {
    return { key: remoteKey, source: 'remote' as const };
  }

  return { key: '', source: 'missing' as const };
}

process.on('uncaughtException', (error) => {
  console.error('[voice-call-ws-proxy] Uncaught Exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[voice-call-ws-proxy] Unhandled Rejection at:', promise, 'reason:', reason);
});

const server = http.createServer((req, res) => {
  console.log(`[voice-call-ws-proxy] HTTP request: ${req.method} ${req.url}`);
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end(
    'Voice call WebSocket proxy. Connect via WebSocket. Query ?key=... is optional when GOOGLE_API_KEY is configured on the proxy or when remote key fetch is configured.',
  );
});

const wss = new WebSocketServer({ server });

wss.on('connection', (clientWs, req) => {
  void handleClientConnection(clientWs, req);
});

async function handleClientConnection(clientWs: WebSocket, req: http.IncomingMessage) {
  console.log(`[voice-call-ws-proxy] New client connection from ${req.socket.remoteAddress}`);

  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  const clientToUpstreamBuffer: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] =
    [];
  const currentUpstreamRef: { current: WebSocket | null } = { current: null };

  const toBuffer = (data: Buffer | ArrayBuffer | Buffer[] | ArrayBufferView | string): Buffer => {
    if (Buffer.isBuffer(data)) return data;
    if (typeof data === 'string') return Buffer.from(data, 'utf8');
    if (data instanceof ArrayBuffer) return Buffer.from(data);
    if (ArrayBuffer.isView(data)) {
      return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
    }
    if (Array.isArray(data)) return Buffer.concat(data);
    return Buffer.alloc(0);
  };

  clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[] | ArrayBufferView | string, isBinary: boolean) => {
    const upstream = currentUpstreamRef.current;
    const buffer = toBuffer(data);

    if (upstream?.readyState === WebSocket.OPEN) {
      console.log(
        `[voice-call-ws-proxy] client -> upstream (${buffer.length} bytes, isBinary=${isBinary})`,
      );
      try {
        upstream.send(buffer);
      } catch (error) {
        console.error('[voice-call-ws-proxy] Send error:', error);
      }
    } else {
      clientToUpstreamBuffer.push({ data: buffer, isBinary });
      console.log(
        `[voice-call-ws-proxy] client buffered (${buffer.length} bytes, isBinary=${isBinary}, queued=${clientToUpstreamBuffer.length})`,
      );
    }
  });

  clientWs.on('close', () => {
    console.log('[voice-call-ws-proxy] Client disconnected');
    currentUpstreamRef.current?.removeAllListeners();
    currentUpstreamRef.current?.close();
    currentUpstreamRef.current = null;
  });

  clientWs.on('error', (error) => {
    console.error('[voice-call-ws-proxy] Client error:', error);
    currentUpstreamRef.current?.close();
  });

  const { key, source } = await resolveGoogleApiKey(url);

  if (!key) {
    clientWs.close(4000, 'Missing key');
    return;
  }

  console.log(`[voice-call-ws-proxy] Using Google API key from ${source}`);

  const upstreamUrl = `${GEMINI_LIVE_WS}?key=${encodeURIComponent(key)}`;

  function tryUpstream(proxyIndex: number) {
    if (clientWs.readyState !== WebSocket.OPEN) return;

    const totalAttempts = Math.max(PROXY_URLS.length, 1);
    if (proxyIndex >= totalAttempts) {
      console.error('[voice-call-ws-proxy] All proxies tried, giving up');
      clientWs.close(1011, 'All proxies are unavailable for Live API');
      return;
    }

    const proxyUrlToUse = PROXY_URLS[proxyIndex] || '';
    const agent = getProxyAgentForUrl(proxyUrlToUse);
    const proxyLabel = proxyUrlToUse
      ? proxyUrlToUse.replace(/:[^:@]+@/, ':****@')
      : 'direct connection';
    console.log(
      `[voice-call-ws-proxy] Trying upstream via ${proxyLabel} (${proxyIndex + 1}/${totalAttempts})`,
    );

    const upstream = new WebSocket(upstreamUrl, {
      agent,
      handshakeTimeout: 25_000,
      headers: {
        Origin: 'https://aistudio.google.com',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    upstream.on('unexpected-response', (_request, response) => {
      const statusCode = response.statusCode || 0;
      if (statusCode === 401 || statusCode === 403) {
        clearRemoteGoogleApiKeyCache();
      }

      console.error(`[voice-call-ws-proxy] Google rejected with status: ${statusCode}`);
      let data = '';
      response.on('data', (chunk) => (data += chunk));
      response.on('end', () =>
        console.error(`[voice-call-ws-proxy] Response body: ${data.slice(0, 500)}`),
      );
    });

    upstream.on('open', () => {
      currentUpstreamRef.current = upstream;
      console.log(`[voice-call-ws-proxy] Upstream connected (${proxyIndex + 1}/${totalAttempts})`);

      setTimeout(() => {
        if (upstream.readyState !== WebSocket.OPEN) return;

        for (const { data, isBinary } of clientToUpstreamBuffer) {
          const buffer = toBuffer(data);
          console.log(
            `[voice-call-ws-proxy] client -> upstream buffered (${buffer.length} bytes, isBinary=${isBinary})`,
          );
          try {
            upstream.send(buffer);
          } catch (error) {
            console.error('[voice-call-ws-proxy] Buffered send error:', error);
          }
        }
      }, 0);
    });

    upstream.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const buffer = toBuffer(data);
      console.log(
        `[voice-call-ws-proxy] upstream -> client (${buffer.length} bytes, isBinary=${isBinary})`,
      );

      try {
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(buffer);
        }
      } catch (error) {
        console.error('[voice-call-ws-proxy] Upstream response error:', error);
      }
    });

    upstream.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString?.() || '';
      console.log(
        `[voice-call-ws-proxy] Upstream closed (${proxyIndex + 1}/${totalAttempts}):`,
        code,
        reasonStr || '(no reason)',
      );

      const shouldRetry =
        isRetriableCloseReason(reasonStr, code) && proxyIndex + 1 < totalAttempts;

      if (currentUpstreamRef.current === upstream) currentUpstreamRef.current = null;
      upstream.removeAllListeners();
      if (clientWs.readyState !== WebSocket.OPEN) return;

      if (shouldRetry) {
        tryUpstream(proxyIndex + 1);
      } else {
        clientWs.close(code, reasonStr || undefined);
      }
    });

    upstream.on('error', (error) => {
      console.error(
        `[voice-call-ws-proxy] Upstream error (${proxyIndex + 1}/${totalAttempts}):`,
        error.message,
      );

      if (currentUpstreamRef.current === upstream) currentUpstreamRef.current = null;
      upstream.removeAllListeners();
      if (clientWs.readyState !== WebSocket.OPEN) return;

      if (proxyIndex + 1 < totalAttempts) {
        tryUpstream(proxyIndex + 1);
      } else {
        clientWs.close(1011, 'Upstream error');
      }
    });
  }

  tryUpstream(0);
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[voice-call-ws-proxy] Listening on ws://0.0.0.0:${PORT}`);

  void loadProxyUrlsFromDb().then((dbUrls) => {
    if (!dbUrls.length) {
      if (PROXY_URLS.length) {
        console.log(
          `[voice-call-ws-proxy] Using ${PROXY_URLS.length} proxy/proxies (will try next on location error)`,
        );
      } else {
        console.warn('[voice-call-ws-proxy] No proxies set, upstream will connect directly');
      }
      return;
    }

    const dedupedDb = Array.from(new Set(dbUrls));
    const merged = mergeUniqueProxyUrls([...dedupedDb, envProxy?.trim(), ...fallbackUrls]);
    PROXY_URLS = merged;
    console.log(
      `[voice-call-ws-proxy] Loaded ${dedupedDb.length} proxy/proxies from DB (total: ${PROXY_URLS.length})`,
    );
  });
});

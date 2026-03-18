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

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PORT = Number(process.env.VOICE_CALL_WS_PROXY_PORT || '3011');

/** Список прокси host:port:user:pass; при отсутствии HTTPS_PROXY используется первый */
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

const envProxy =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy;

const fallbackUrls = FALLBACK_PROXY_LIST.map(parseProxyEntry).filter(Boolean);
/** Список URL прокси для перебора (при отказе Google по региону пробуем следующий) */
const PROXY_URLS: string[] = envProxy?.trim()
  ? [envProxy.trim(), ...fallbackUrls]
  : fallbackUrls;

function getProxyAgentForUrl(url: string): InstanceType<typeof HttpsProxyAgent> | InstanceType<typeof SocksProxyAgent> | undefined {
  if (!url?.trim()) return undefined;
  const u = url.trim();
  if (u.startsWith('socks')) return new SocksProxyAgent(u);
  return new HttpsProxyAgent(u);
}

function isRetriableCloseReason(reason: string): boolean {
  const r = reason.toLowerCase();
  return /location|region|not supported|restricted|country|geo/i.test(r) || r.includes('403') || r.length === 0;
}

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Voice call WebSocket proxy. Connect via WebSocket with ?key=YOUR_GOOGLE_API_KEY');
});

const wss = new WebSocketServer({ server, path: '/' });

const getDataByteLength = (data: Buffer | ArrayBuffer | Buffer[]): number => {
  if (Buffer.isBuffer(data)) return data.length;
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (Array.isArray(data)) return Buffer.concat(data).length;
  return 0;
};

wss.on('connection', (clientWs, req) => {
  const url = req.url ? new URL(req.url, 'http://localhost') : null;
  const key = url?.searchParams.get('key');
  if (!key) {
    clientWs.close(4000, 'Missing key');
    return;
  }

  const upstreamUrl = `${GEMINI_LIVE_WS}?key=${encodeURIComponent(key)}`;
  const clientToUpstreamBuffer: { data: Buffer | ArrayBuffer | Buffer[]; isBinary: boolean }[] = [];
  const currentUpstreamRef: { current: WebSocket | null } = { current: null };

  clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const up = currentUpstreamRef.current;
    if (up?.readyState === WebSocket.OPEN) {
      const bytes = getDataByteLength(data);
      console.log(`[voice-call-ws-proxy] client -> upstream (${bytes} bytes, isBinary=${isBinary})`);
      up.send(data, { binary: isBinary });
    } else {
      clientToUpstreamBuffer.push({ data, isBinary });
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
    console.log(`[voice-call-ws-proxy] Trying upstream via proxy ${proxyIndex + 1}/${PROXY_URLS.length}: ${masked}`);

    const upstream = new WebSocket(upstreamUrl, {
      agent,
      handshakeTimeout: 25_000,
    });

    upstream.on('open', () => {
      currentUpstreamRef.current = upstream;
      console.log(`[voice-call-ws-proxy] Upstream connected (proxy ${proxyIndex + 1})`);
      for (const { data, isBinary } of clientToUpstreamBuffer) {
        const bytes = getDataByteLength(data);
        console.log(`[voice-call-ws-proxy] client -> upstream buffered (${bytes} bytes, isBinary=${isBinary})`);
        if (upstream.readyState === WebSocket.OPEN) upstream.send(data, { binary: isBinary });
      }
      // Не очищаем буфер, чтобы при закрытии по location error и переходе на следующий прокси
      // первоначальное сообщение (setupMsg) отправлялось заново.
    });

    upstream.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const bytes = getDataByteLength(data);
      console.log(`[voice-call-ws-proxy] upstream -> client (${bytes} bytes, isBinary=${isBinary})`);
      if (clientWs.readyState === WebSocket.OPEN) clientWs.send(data, { binary: isBinary });
    });

    upstream.on('close', (code: number, reason: Buffer) => {
      const reasonStr = reason?.toString?.() || '';
      console.log(`[voice-call-ws-proxy] Upstream closed (proxy ${proxyIndex + 1}):`, code, reasonStr || '(no reason)');
      if (currentUpstreamRef.current === upstream) currentUpstreamRef.current = null;
      upstream.removeAllListeners();
      if (clientWs.readyState !== WebSocket.OPEN) return;
      if (isRetriableCloseReason(reasonStr) && proxyIndex + 1 < PROXY_URLS.length) {
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

  tryUpstream(1);
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[voice-call-ws-proxy] Listening on ws://0.0.0.0:${PORT}`);
  if (PROXY_URLS.length) console.log(`[voice-call-ws-proxy] Using ${PROXY_URLS.length} proxy/proxies (will try next on location error)`);
  else console.warn('[voice-call-ws-proxy] No proxies set — upstream will connect directly');
});

#!/usr/bin/env bun
/**
 * WebSocket-прокси для голосового звонка (Gemini Live).
 * Принимает подключения от браузера и проксирует их к Google через HTTPS_PROXY.
 * Запуск: VOICE_CALL_WS_PROXY_PORT=3011 bun run scripts/voice-call-ws-proxy.mts
 * В .env задайте HTTPS_PROXY (или HTTP_PROXY) и VOICE_CALL_WS_PROXY_URL=ws://localhost:3011
 */

import { HttpsProxyAgent } from 'https-proxy-agent';
import http from 'node:http';
import WebSocket, { WebSocketServer } from 'ws';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const PORT = Number(process.env.VOICE_CALL_WS_PROXY_PORT || '3011');
const proxyUrl =
  process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;

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
  const agent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : undefined;

  const upstream = new WebSocket(upstreamUrl, {
    agent,
    handshakeTimeout: 30_000,
  });

  upstream.on('open', () => {
    console.log('[voice-call-ws-proxy] Upstream connected');
    clientWs.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
      const bytes = getDataByteLength(data);
      console.log(`[voice-call-ws-proxy] client -> upstream (${bytes} bytes, isBinary=${isBinary})`);
      if (upstream.readyState === upstream.OPEN) upstream.send(data, { binary: isBinary });
    });
    clientWs.on('close', () => {
      console.log('[voice-call-ws-proxy] Client disconnected');
      upstream.close();
    });
    clientWs.on('error', (err) => {
      console.error('[voice-call-ws-proxy] Client error:', err);
      upstream.close();
    });
  });

  upstream.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => {
    const bytes = getDataByteLength(data);
    console.log(`[voice-call-ws-proxy] upstream -> client (${bytes} bytes, isBinary=${isBinary})`);
    if (clientWs.readyState === clientWs.OPEN) clientWs.send(data, { binary: isBinary });
  });
  upstream.on('close', () => clientWs.close());
  upstream.on('error', (err) => {
    console.error('[voice-call-ws-proxy] upstream error:', err.message);
    clientWs.close(1011, 'Upstream error');
  });
});

server.listen(PORT, () => {
  console.log(`[voice-call-ws-proxy] Listening on ws://localhost:${PORT}`);
  if (proxyUrl) console.log('[voice-call-ws-proxy] Using proxy:', proxyUrl.replace(/:[^:@]+@/, ':****@'));
  else console.warn('[voice-call-ws-proxy] No HTTPS_PROXY set — upstream will connect directly');
});

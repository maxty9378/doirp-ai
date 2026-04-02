#!/usr/bin/env bun
/**
 * Проверка доступности WS-туннелей для voice-call тренажёра.
 * Делает WebSocket upgrade probe и печатает HTTP-статус первой строки ответа.
 */

import net from 'node:net';
import tls from 'node:tls';

interface Endpoint {
  label: string;
  url: string;
}

const DEFAULT_ENDPOINTS: Endpoint[] = [
  { label: 'prod same-origin tunnel', url: 'wss://doirp-ai.vercel.app/gemini-live-ws' },
  { label: 'public fallback (current)', url: 'wss://apidoirp.ru/voice-call-ws' },
  { label: 'public fallback (legacy)', url: 'wss://ponkacat.ru/voice-call-ws' },
];

const TIMEOUT_MS = Number(process.env.WS_PROBE_TIMEOUT_MS || '10000');
const DEFAULT_PROXY =
  process.env.HTTPS_PROXY ||
  process.env.https_proxy ||
  process.env.HTTP_PROXY ||
  process.env.http_proxy ||
  '';
const WS_PROBE_PROXY_URL = process.env.WS_PROBE_PROXY_URL || DEFAULT_PROXY;

function randomKey() {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64');
}

async function probeWs(url: string): Promise<string> {
  const parsed = new URL(url);
  const host = parsed.hostname;
  const port = Number(parsed.port || (parsed.protocol === 'wss:' ? '443' : '80'));
  const path = `${parsed.pathname || '/'}${parsed.search || ''}`;

  const request = [
    `GET ${path} HTTP/1.1`,
    `Host: ${host}`,
    'Upgrade: websocket',
    'Connection: Upgrade',
    `Sec-WebSocket-Key: ${randomKey()}`,
    'Sec-WebSocket-Version: 13',
    'Origin: https://doirp-ai.vercel.app',
    '',
    '',
  ].join('\r\n');

  return await new Promise<string>((resolve, reject) => {
    const openDirectSocket = () =>
      parsed.protocol === 'wss:'
        ? tls.connect({ host, port, servername: host })
        : net.connect({ host, port });

    const openViaHttpProxy = (): Promise<net.Socket | tls.TLSSocket> =>
      new Promise((resolveProxy, rejectProxy) => {
        if (!WS_PROBE_PROXY_URL) return resolveProxy(openDirectSocket());
        const proxy = new URL(WS_PROBE_PROXY_URL);
        const proxyHost = proxy.hostname;
        const proxyPort = Number(proxy.port || (proxy.protocol === 'https:' ? '443' : '80'));
        const auth =
          proxy.username || proxy.password
            ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString('base64')}\r\n`
            : '';

        const proxySocket = net.connect({ host: proxyHost, port: proxyPort });
        proxySocket.once('error', rejectProxy);
        proxySocket.once('connect', () => {
          const connectReq =
            `CONNECT ${host}:${port} HTTP/1.1\r\n` +
            `Host: ${host}:${port}\r\n` +
            auth +
            'Connection: keep-alive\r\n\r\n';
          proxySocket.write(connectReq);
        });
        proxySocket.once('data', (chunk) => {
          const head = chunk.toString('utf8');
          const firstLine = head.split('\r\n')[0] || '';
          if (!firstLine.includes('200')) {
            proxySocket.destroy();
            return rejectProxy(new Error(`proxy CONNECT failed: ${firstLine || 'empty response'}`));
          }
          if (parsed.protocol === 'wss:') {
            const tlsSocket = tls.connect({ socket: proxySocket, servername: host });
            return resolveProxy(tlsSocket);
          }
          resolveProxy(proxySocket);
        });
      });

    let socket: net.Socket | tls.TLSSocket;

    const timer = setTimeout(() => {
      socket?.destroy();
      reject(new Error(`timeout after ${TIMEOUT_MS}ms`));
    }, TIMEOUT_MS);

    openViaHttpProxy()
      .then((connectedSocket) => {
        socket = connectedSocket;
        socket.once('error', (error) => {
          clearTimeout(timer);
          reject(error);
        });
        socket.write(request);
        socket.once('data', (chunk) => {
          clearTimeout(timer);
          const firstLine = chunk.toString('utf8').split('\r\n')[0] || '<empty response>';
          socket.destroy();
          resolve(firstLine);
        });
      })
      .catch((error) => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

async function main() {
  console.log(`WS probe timeout: ${TIMEOUT_MS}ms`);
  console.log(`WS probe proxy: ${WS_PROBE_PROXY_URL || '<direct>'}`);

  for (const endpoint of DEFAULT_ENDPOINTS) {
    try {
      const status = await probeWs(endpoint.url);
      const isGood = status.includes('101') || status.includes('400') || status.includes('401');
      console.log(`${isGood ? '✅' : '⚠️'} ${endpoint.label}: ${endpoint.url} -> ${status}`);
    } catch (error) {
      console.log(`❌ ${endpoint.label}: ${endpoint.url} -> ${(error as Error).message}`);
    }
  }
}

main();

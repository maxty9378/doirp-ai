#!/usr/bin/env bun
/**
 * Быстрый тест: прокси принимает WebSocket и закрывает при ошибке апстрима (неверный key).
 */
import WebSocket from 'ws';

const PROXY_WS = 'ws://localhost:3011';
const timeout = 8000;

async function main() {
  const ws = new WebSocket(`${PROXY_WS}?key=invalid-key-for-test`);
  const openPromise = new Promise<void>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('open timeout')), timeout);
    ws.on('open', () => {
      clearTimeout(t);
      resolve();
    });
    ws.on('error', (e) => reject(e));
  });
  const closePromise = new Promise<{ code: number; reason: string }>((resolve) => {
    ws.on('close', (code, reason) => resolve({ code, reason: reason.toString() }));
  });

  try {
    await openPromise;
    console.log('ok: proxy accepted WebSocket connection');
  } catch (e) {
    console.error('fail: proxy did not accept connection', e);
    process.exit(1);
  }

  ws.terminate();
  const closed = await Promise.race([
    closePromise,
    new Promise<null>((_, reject) => setTimeout(() => reject(new Error('close timeout')), 2000)),
  ]).catch(() => null);
  if (closed) console.log('ok: proxy closed with code=%s', closed.code);
  console.log('voice-call-ws-proxy test passed');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

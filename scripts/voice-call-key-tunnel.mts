#!/usr/bin/env bun
// @ts-nocheck
/**
 * Reverse SSH tunnel for voice-call proxy key exchange.
 * Exposes local /api/voice-call/proxy-key to the remote proxy host without exposing GOOGLE_API_KEY to the browser.
 *
 * Example:
 * VOICE_CALL_PROXY_TUNNEL_HOST=<remote-host> \
 * VOICE_CALL_PROXY_TUNNEL_USER=root \
 * VOICE_CALL_PROXY_TUNNEL_PASSWORD=*** \
 * bun run scripts/voice-call-key-tunnel.mts
 */

import net from 'node:net';

import { Client } from 'ssh2';

const SSH_HOST = process.env.VOICE_CALL_PROXY_TUNNEL_HOST?.trim() || '';
const SSH_PORT = Number(process.env.VOICE_CALL_PROXY_TUNNEL_PORT || '22');
const SSH_USER = process.env.VOICE_CALL_PROXY_TUNNEL_USER?.trim() || '';
const SSH_PASSWORD = process.env.VOICE_CALL_PROXY_TUNNEL_PASSWORD?.trim() || '';

const REMOTE_HOST = process.env.VOICE_CALL_PROXY_TUNNEL_REMOTE_HOST?.trim() || '127.0.0.1';
const REMOTE_PORT = Number(process.env.VOICE_CALL_PROXY_TUNNEL_REMOTE_PORT || '3211');
const LOCAL_HOST = process.env.VOICE_CALL_PROXY_TUNNEL_LOCAL_HOST?.trim() || '127.0.0.1';
const LOCAL_PORT = Number(process.env.VOICE_CALL_PROXY_TUNNEL_LOCAL_PORT || '3010');

if (!SSH_HOST || !SSH_USER || !SSH_PASSWORD) {
  console.error(
    '[voice-call-key-tunnel] Set VOICE_CALL_PROXY_TUNNEL_HOST, VOICE_CALL_PROXY_TUNNEL_USER and VOICE_CALL_PROXY_TUNNEL_PASSWORD.',
  );
  process.exit(1);
}

const conn = new Client();
let shuttingDown = false;

const closeAndExit = (code: number) => {
  shuttingDown = true;
  try {
    conn.unforwardIn(REMOTE_HOST, REMOTE_PORT, () => {
      conn.end();
      process.exit(code);
    });
  } catch {
    conn.end();
    process.exit(code);
  }
};

conn.on('ready', () => {
  conn.forwardIn(REMOTE_HOST, REMOTE_PORT, (error) => {
    if (error) {
      console.error('[voice-call-key-tunnel] Failed to open reverse tunnel:', error);
      process.exit(1);
    }

    console.log(
      `[voice-call-key-tunnel] Forwarding ${REMOTE_HOST}:${REMOTE_PORT} -> ${LOCAL_HOST}:${LOCAL_PORT}`,
    );
  });
});

conn.on('tcp connection', (_details, accept, reject) => {
  const upstream = accept();
  const localSocket = net.connect({ host: LOCAL_HOST, port: LOCAL_PORT });

  localSocket.on('error', (error) => {
    console.error('[voice-call-key-tunnel] Local connection error:', error.message);
    try {
      reject();
    } catch {}
    upstream.destroy();
  });

  upstream.on('error', (error) => {
    console.error('[voice-call-key-tunnel] Remote tunnel stream error:', error.message);
    localSocket.destroy();
  });

  upstream.pipe(localSocket).pipe(upstream);
});

conn.on('error', (error) => {
  console.error('[voice-call-key-tunnel] SSH error:', error.message);
});

conn.on('close', () => {
  if (!shuttingDown) {
    console.error('[voice-call-key-tunnel] SSH tunnel closed unexpectedly.');
    process.exit(1);
  }
});

process.on('SIGINT', () => closeAndExit(0));
process.on('SIGTERM', () => closeAndExit(0));

conn.connect({
  host: SSH_HOST,
  keepaliveCountMax: 10,
  keepaliveInterval: 10_000,
  password: SSH_PASSWORD,
  port: SSH_PORT,
  username: SSH_USER,
});

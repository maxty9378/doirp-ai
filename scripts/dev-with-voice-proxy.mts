#!/usr/bin/env bun
/**
 * Запуск dev-сервера.
 * По умолчанию локальный WS-прокси НЕ стартует (используется удалённый VOICE_CALL_WS_PROXY_DEV/дефолт).
 * Чтобы принудительно поднять локальный прокси, задайте VOICE_CALL_WS_PROXY_LOCAL=1.
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const exec = process.execPath;

const shouldRunLocalProxy = process.env.VOICE_CALL_WS_PROXY_LOCAL === '1';
const proxy = shouldRunLocalProxy
  ? spawn(exec, ['run', 'scripts/voice-call-ws-proxy.mts'], {
      cwd: root,
      stdio: 'inherit',
      env: { ...process.env, VOICE_CALL_WS_PROXY_PORT: '3011' },
    })
  : null;

function killAll() {
  proxy?.kill();
  process.exit(0);
}
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

if (shouldRunLocalProxy) {
  await new Promise((r) => setTimeout(r, 1000));
}

const dev = spawn(exec, ['run', 'dev:next'], {
  cwd: root,
  stdio: 'inherit',
  env: {
    ...process.env,
    ...(shouldRunLocalProxy ? { VOICE_CALL_WS_PROXY_DEV: 'ws://localhost:3011' } : {}),
  },
});

dev.on('exit', (code) => {
  proxy?.kill();
  process.exit(code ?? 0);
});

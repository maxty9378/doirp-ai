#!/usr/bin/env bun
/**
 * Запуск dev-сервера вместе с WebSocket-прокси для тренажёра (Gemini Live).
 * Прокси слушает порт 3011 и проксирует трафик в Google через встроенный список прокси.
 * Использование: bun run dev
 */

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const exec = process.execPath;

const proxy = spawn(exec, ['run', 'scripts/voice-call-ws-proxy.mts'], {
  cwd: root,
  stdio: 'inherit',
  env: { ...process.env, VOICE_CALL_WS_PROXY_PORT: '3011' },
});

function killAll() {
  proxy.kill();
  process.exit(0);
}
process.on('SIGINT', killAll);
process.on('SIGTERM', killAll);

await new Promise((r) => setTimeout(r, 1000));

const dev = spawn(exec, ['run', 'dev:next'], {
  cwd: root,
  stdio: 'inherit',
});

dev.on('exit', (code) => {
  proxy.kill();
  process.exit(code ?? 0);
});

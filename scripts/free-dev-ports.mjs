#!/usr/bin/env node
/**
 * Перед `pnpm dev`: освобождает порты 5681 (code-inspector) и 3010 (next dev),
 * при необходимости удаляет кэш .next.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const PORTS = [5681, 3010];
const isWin = process.platform === 'win32';
const sleepSync = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

function killProcessOnPort(port) {
  try {
    if (isWin) {
      const out = execSync(`netstat -ano | findstr :${port}`, {
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const pids = new Set();
      for (const line of out.split('\n')) {
        const m = line.trim().split(/\s+/);
        const pid = m[m.length - 1];
        if (pid && /^\d+$/.test(pid)) pids.add(pid);
      }
      for (const pid of pids) {
        execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' });
        console.log(`  Порт ${port}: процесс ${pid} завершён`);
      }
      if (pids.size === 0 && out.trim()) console.log(`  Порт ${port}: занят, PID не получен`);
    } else {
      const pids = execSync(`lsof -ti :${port}`, { encoding: 'utf8' }).trim();
      if (pids) {
        execSync(`kill -9 ${pids.split(/\s+/).join(' ')}`, { stdio: 'ignore' });
        console.log(`  Порт ${port}: освобождён`);
      }
    }
  } catch (e) {
    if (e.status === 1 || e.killed) return; // нет процесса на порту
    console.warn(`  Порт ${port}: ${e.message || e}`);
  }
}

function cleanNextDir() {
  const dir = path.join(process.cwd(), '.next');
  if (!fs.existsSync(dir)) return;
  const RETRIES = 6;
  const RETRY_DELAY_MS = 250;

  for (let attempt = 1; attempt <= RETRIES; attempt++) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      console.log('  Кэш .next удалён');
      return;
    } catch (e) {
      const isRetryable = e?.code === 'EPERM' || e?.code === 'EBUSY';
      const hasAttemptsLeft = attempt < RETRIES;

      if (isRetryable && hasAttemptsLeft) {
        // On Windows taskkill can return before the process fully releases file handles.
        sleepSync(RETRY_DELAY_MS);
        continue;
      }

      console.warn(`  Не удалось очистить .next (${e?.code || 'UNKNOWN'}). Продолжаю запуск без очистки.`);
      return;
    }
  }
}

console.log('Predev: освобождение портов и очистка...');
for (const port of PORTS) killProcessOnPort(port);
cleanNextDir();
console.log('Готово.\n');

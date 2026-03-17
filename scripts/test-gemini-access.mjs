/**
 * Проверка доступа к Gemini API: с прокси и без.
 * Запуск: node scripts/test-gemini-access.mjs
 */
import 'dotenv/config';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import fetch from 'node-fetch';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';

dotenvExpand.expand(dotenv.config({ path: '.env.local' }));

const url = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || '';
const agent = url.trim()
  ? url.trim().startsWith('socks')
    ? new SocksProxyAgent(url.trim())
    : new HttpsProxyAgent(url.trim())
  : null;

const base = process.env.GOOGLE_API_BASE || 'https://generativelanguage.googleapis.com/v1beta';
const key = (process.env.GOOGLE_TTS_API_KEY || process.env.GOOGLE_API_KEY || '')
  .trim()
  .split(/[\n,;]/)[0]
  .trim();
const testUrl = `${base}/models?key=${encodeURIComponent(key)}`;

async function run() {
  console.log('API base:', base);
  console.log('Proxy:', url || '(не задан)');
  console.log('');

  console.log('1) Без прокси (прямой доступ):');
  try {
    const r = await fetch(testUrl, { method: 'GET' });
    console.log('   Status:', r.status, r.statusText);
    if (!r.ok) console.log('   Body:', (await r.text()).slice(0, 200));
    else console.log('   OK');
  } catch (e) {
    console.log('   Ошибка:', e.code || e.type, '-', e.message);
  }

  console.log('2) Через прокси:');
  try {
    const r = await fetch(testUrl, { method: 'GET', agent: agent || undefined });
    console.log('   Status:', r.status, r.statusText);
    if (!r.ok) console.log('   Body:', (await r.text()).slice(0, 200));
    else console.log('   OK');
  } catch (e) {
    console.log('   Ошибка:', e.code || e.type, '-', e.message);
  }
}

run();

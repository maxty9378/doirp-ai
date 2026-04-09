import { execSync } from 'node:child_process';

import dotenv from 'dotenv';

import { resolveVoiceCallTestProxyUrls } from './_localAccess.mjs';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('GOOGLE_API_KEY is not set');
  process.exit(1);
}

const proxies = await resolveVoiceCallTestProxyUrls();
if (!proxies.length) {
  console.error(
    'No proxy URLs configured. Set VOICE_CALL_PROXY_TEST_URLS or add proxies.voiceCallFallbackEntries to .local/server-access.json.',
  );
  process.exit(1);
}

const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function testProxy(url: string) {
  const masked = url.replace(/:[^:@]+@/, ':****@');
  const start = Date.now();

  try {
    const command =
      process.platform === 'win32'
        ? `curl.exe -s -o NUL -w "%{http_code}" -x "${url}" "${testUrl}"`
        : `curl -s -o /dev/null -w "%{http_code}" -x "${url}" "${testUrl}"`;
    const result = execSync(command).toString().trim();
    const latency = Date.now() - start;

    if (result === '200') {
      console.log(`OK [${latency}ms] ${masked}`);
      return true;
    }

    console.log(`FAIL [${latency}ms] ${masked} -> HTTP ${result}`);
    return false;
  } catch (error) {
    const latency = Date.now() - start;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`FAIL [${latency}ms] ${masked} -> ${message}`);
    return false;
  }
}

console.log(`Testing ${proxies.length} proxies via curl...`);

let successCount = 0;
for (const proxy of proxies) {
  const ok = await testProxy(proxy);
  if (ok) successCount++;
}

console.log(`Done: ${successCount}/${proxies.length} proxies responded with HTTP 200.`);

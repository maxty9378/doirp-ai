import { execSync } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROXIES = [
  'socks5h://gemini:gBOiFtedtz2SHEVNtTqi@95.81.98.243:20818',
  'socks5h://cddtxqdm:kcqr3pqna7ja@31.59.20.176:6754',
  'socks5h://cddtxqdm:kcqr3pqna7ja@23.95.150.145:6114',
  'socks5h://cddtxqdm:kcqr3pqna7ja@198.23.239.134:6540',
  'socks5h://cddtxqdm:kcqr3pqna7ja@45.38.107.97:6014',
  'socks5h://cddtxqdm:kcqr3pqna7ja@107.172.163.27:6543',
  'socks5h://cddtxqdm:kcqr3pqna7ja@198.105.121.200:6462',
  'socks5h://cddtxqdm:kcqr3pqna7ja@216.10.27.159:6837',
  'socks5h://cddtxqdm:kcqr3pqna7ja@142.111.67.146:5611',
  'socks5h://cddtxqdm:kcqr3pqna7ja@191.96.254.138:6185',
  'socks5h://cddtxqdm:kcqr3pqna7ja@31.58.9.4:6077',
];

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY is not set');
  process.exit(1);
}

const TEST_URL = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;

async function testProxy(url: string) {
  const masked = url.replace(/:[^:@]+@/, ':****@');
  const start = Date.now();
  try {
    // Используем curl для надежности теста прокси в консоли
    const cmd = `curl -s -o /dev/null -w "%{http_code}" -x "${url}" "${TEST_URL}"`;
    // На Windows curl может вести себя иначе, попробуем через PowerShell если мы на Win
    const isWin = process.platform === 'win32';
    
    let result;
    if (isWin) {
      // В PowerShell curl это часто алиас к Invoke-WebRequest, лучше использовать оригинальный curl.exe
      const winCmd = `curl.exe -s -o NUL -w "%{http_code}" -x "${url}" "${TEST_URL}"`;
      result = execSync(winCmd).toString().trim();
    } else {
      result = execSync(cmd).toString().trim();
    }
    
    const latency = Date.now() - start;
    if (result === '200') {
      console.log(`✅ [${latency}ms] ${masked} - OK (200)`);
      return true;
    } else {
      console.log(`❌ [${latency}ms] ${masked} - Error status: ${result}`);
      return false;
    }
  } catch (err: any) {
    const latency = Date.now() - start;
    console.log(`❌ [${latency}ms] ${masked} - Exception: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log(`🚀 Testing ${PROXIES.length} proxies via curl...`);
  let successCount = 0;
  for (const proxy of PROXIES) {
    const ok = await testProxy(proxy);
    if (ok) successCount++;
  }
  console.log(`\n📊 Results: ${successCount}/${PROXIES.length} proxies working.`);
}

main();

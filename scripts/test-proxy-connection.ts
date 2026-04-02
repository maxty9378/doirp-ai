import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import WebSocket from 'ws';

// const proxy = 'socks5h://cddtxqdm:kcqr3pqna7ja@31.59.20.176:6754';
const proxy = 'http://cddtxqdm:kcqr3pqna7ja@31.59.20.176:6754';
const agent = new HttpsProxyAgent(proxy);

const key = process.env.GOOGLE_API_KEY || 'AIzaSyDSMWTyCWsaiC2lfAxpNgAkIupf-4IUeA0';
const url = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${key}`;

console.log('Connecting to', proxy);

const ws = new WebSocket(url, {
  agent,
  headers: {
    'Origin': 'https://aistudio.google.com',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
  }
});

ws.on('open', () => {
  console.log('✅ Open!');
  ws.send(JSON.stringify({
    setup: { model: 'models/gemini-3.1-flash-live-preview' }
  }));
});

ws.on('message', (data) => {
  console.log('📩 Message:', data.toString());
  ws.close();
});

ws.on('close', (code, reason) => {
  console.log('🔌 Close:', code, reason.toString());
});

ws.on('error', (err) => {
  console.error('❌ Error:', err);
});

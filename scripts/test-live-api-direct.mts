
import WebSocket from 'ws';
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: '.env.local' });

const API_KEY = process.env.GOOGLE_API_KEY;
const PROXY_URL = 'ws://localhost:3011'; // Наш локальный прокси

if (!API_KEY) {
  console.error('GOOGLE_API_KEY не найден в .env.local');
  process.exit(1);
}

console.log('--- Тест прямого подключения к Gemini Live через прокси ---');
console.log(`Ключ: ${API_KEY.slice(0, 10)}...`);
console.log(`Прокси: ${PROXY_URL}`);

const wsUrl = `${PROXY_URL}?key=${API_KEY}`;
const ws = new WebSocket(wsUrl);

const timeout = setTimeout(() => {
  console.error('Превышено время ожидания (30с)');
  ws.terminate();
  process.exit(1);
}, 30000);

ws.on('open', () => {
  console.log('✅ Соединение с прокси установлено');
  
  // Отправляем setup сообщение
  const setupMsg = {
    setup: {
      model: 'models/gemini-3.1-flash-live-preview',
    }
  };
  console.log('Отправка setup сообщения...');
  ws.send(JSON.stringify(setupMsg));
});

ws.on('message', (data) => {
  const msg = JSON.parse(data.toString());
  console.log('📩 Получено сообщение от сервера:', JSON.stringify(msg, null, 2));

  if (msg.setupComplete) {
    console.log('🎉 УСПЕХ: Gemini Live подтвердил готовность (setupComplete)!');
    
    // Попробуем отправить текстовый ввод, чтобы проверить, что прокси передает данные
    console.log('Отправка тестового приветствия...');
    ws.send(JSON.stringify({
      clientContent: {
        turns: [{ role: 'user', parts: [{ text: 'Привет! Ты меня слышишь? Ответь очень коротко.' }] }],
        turnComplete: true
      }
    }));
  }

  if (msg.serverContent?.modelTurn) {
    console.log('🤖 Получен ответ от модели!');
    clearTimeout(timeout);
    ws.close();
    process.exit(0);
  }
});

ws.on('error', (err) => {
  console.error('❌ Ошибка WebSocket:', err);
  process.exit(1);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Соединение закрыто (код: ${code}, причина: ${reason})`);
});

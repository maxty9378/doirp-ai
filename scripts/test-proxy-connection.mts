#!/usr/bin/env bun
import WebSocket from 'ws';

// Мы используем фейковый ключ, но его формат должен быть правильным,
// чтобы Google не разорвал соединение до ответа "API key not valid",
// или мы проверим, что получаем JSON-ошибку вместо бинарного мусора.
// Но лучше использовать настоящий ключ из .env.
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const PROXY_WS = 'ws://localhost:3011';
const key = process.env.GOOGLE_API_KEY || 'fake-key-12345';
const ws = new WebSocket(`${PROXY_WS}?key=${key}`);

let gotResponse = false;

ws.on('open', () => {
  console.log('✅ Connected to proxy');
  
  // Эмулируем setup-сообщение от useGeminiLive.ts
  const setupMsg = {
    setup: {
      model: 'models/gemini-2.5-flash-native-audio-latest',
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Charon',
            },
          },
        },
      },
      systemInstruction: {
        parts: [{ text: 'Ты журналистка-расследователь' }],
      },
    },
  };

  console.log('📤 Sending setup message...');
  ws.send(JSON.stringify(setupMsg));
});

ws.on('message', (data, isBinary) => {
  gotResponse = true;
  if (isBinary) {
    const bytes =
      typeof data === 'string'
        ? Buffer.byteLength(data, 'utf8')
        : Buffer.isBuffer(data)
          ? data.length
          : data instanceof ArrayBuffer
            ? data.byteLength
            : Array.isArray(data)
              ? Buffer.concat(data).length
              : 0;
    console.log('📥 Received BINARY message of size:', bytes);
  } else {
    const text = data.toString('utf8');
    console.log('📥 Received TEXT message:');
    try {
      const json = JSON.parse(text);
      if (json.setupComplete) {
        console.log('✅ Success: Received setupComplete!');
      } else if (json.error) {
        console.log('❌ Error from Google:', json.error.message || json.error);
      } else {
        console.log('❓ Received unknown JSON:', json);
      }
    } catch (e) {
      console.log('Text content:', text);
    }
  }
  
  // Закрываем после первого ответа
  setTimeout(() => {
    ws.close();
  }, 100);
});

ws.on('close', (code, reason) => {
  console.log(`🔌 Connection closed (code: ${code}, reason: ${reason})`);
  if (!gotResponse) {
    console.error('❌ Failed: Connection closed before receiving any response from Gemini');
    process.exit(1);
  }
});

ws.on('error', (err) => {
  console.error('❌ WebSocket error:', err.message);
  process.exit(1);
});

// Timeout через 10 секунд
setTimeout(() => {
  if (!gotResponse) {
    console.error('❌ Failed: Timeout waiting for response');
    ws.close();
    process.exit(1);
  }
}, 10000);

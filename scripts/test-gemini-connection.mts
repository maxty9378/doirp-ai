#!/usr/bin/env bun
import WebSocket from 'ws';
import dotenv from 'dotenv';
dotenv.config({ path: '.env' });
dotenv.config({ path: '.env.local' });

const apiKey = process.env.GOOGLE_API_KEY;
if (!apiKey) {
  console.error('❌ GOOGLE_API_KEY is not set');
  process.exit(1);
}

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

console.log('🔌 Connecting to Gemini API (Proxy: None)...');

const ws = new WebSocket(`${GEMINI_LIVE_WS}?key=${apiKey}`);

ws.on('open', () => {
  console.log('✅ Connected! Sending setup...');

  const setupMsg = {
    setup: {
      model: 'models/gemini-2.0-flash',
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
        parts: [
          {
            text:
              'Ты журналистка-расследователь. Ответь коротко: "Я готова начать".',
          },
        ],
      },
    },
  };

  ws.send(JSON.stringify(setupMsg));
});

ws.on('message', (data, isBinary) => {
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
    console.log(`📥 Received BINARY frame (${bytes} bytes) - likely Audio!`);
  } else {
    const text = data.toString('utf8');
    try {
      const json = JSON.parse(text);
      if (json.setupComplete) {
        console.log('вњ… setupComplete received. Sending initial message...');

        // РћС‚РїСЂР°РІР»СЏРµРј РїРµСЂРІРѕРµ СЃРѕРѕР±С‰РµРЅРёРµ РѕС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
        ws.send(
          JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: 'user',
                  parts: [{ text: 'Начинай диалог.' }],
                },
              ],
              turnComplete: true,
            },
          }),
        );
      } else if (json.serverContent) {
        console.log('📥 Received AI Response!');
        const parts = json.serverContent?.modelTurn?.parts || [];
        for (const part of parts) {
          if (part.text) {
            console.log('💬 AI TEXT:', part.text);
            console.log('вњ… Test successful! Exiting...');
            ws.close();
            process.exit(0);
          }
        }
      } else {
        console.log('📥 Received other JSON:', JSON.stringify(json).substring(0, 100) + '...');
      }
    } catch {
      console.log('📥 Received text:', text);
    }
  }
});

ws.on('error', (err) => {
  console.error('вќЊ WebSocket Error:', err.message);
});

ws.on('close', (code, reason) => {
  console.log(`рџ”Њ Connection closed: ${code} ${reason}`);
});

setTimeout(() => {
  console.error('вќЊ Timeout waiting for AI reply');
  process.exit(1);
}, 20000);

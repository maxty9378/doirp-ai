'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export interface UseGeminiSocketOptions {
  wsUrl: string;
  systemInstruction: string;
  voiceName: string;
  liveModel?: string;

  onOpen?: () => void;
  onClose?: (code: number, reason: string) => void;
  onError?: (error: unknown) => void;

  onAudioChunk?: (base64Audio: string) => void;
  onTurnComplete?: () => void;
  onTranscription?: (text: string) => void;
  onInterrupted?: () => void;
}

export interface GeminiSocketApi {
  connect: () => void;
  disconnect: () => void;
  sendAudioData: (base64PCM: string) => void;
  sendClientText: (text: string) => void;
  isConnected: boolean;
}

export function useGeminiSocket(options: UseGeminiSocketOptions): GeminiSocketApi {
  const {
    wsUrl,
    systemInstruction,
    voiceName,
    liveModel = 'models/gemini-2.0-flash-exp',
    onOpen,
    onClose,
    onError,
    onAudioChunk,
    onTurnComplete,
    onTranscription,
    onInterrupted,
  } = options;

  const socketRef = useRef<WebSocket | null>(null);
  const isConnectedRef = useRef(false);
  const [isConnected, setIsConnected] = useState(false);
  const setupCompletedRef = useRef(false);

  const closeSocket = useCallback(
    (code?: number, reason?: string) => {
      const ws = socketRef.current;
      if (!ws) return;
      try {
        ws.close(code, reason);
      } catch {
        // ignore
      } finally {
        socketRef.current = null;
        isConnectedRef.current = false;
        setupCompletedRef.current = false;
        setIsConnected(false);
      }
    },
    [],
  );

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      try {
        let raw: string;

        if (typeof event.data === 'string') {
          raw = event.data;
        } else if (event.data instanceof Blob) {
          raw = await event.data.text();
        } else {
          raw = new TextDecoder().decode(event.data as ArrayBuffer);
        }

        const data = JSON.parse(raw);

        if (data.error?.message) {
          console.error('[useGeminiSocket] Error from server:', data.error.message);
          onError?.(new Error(data.error.message));
          return;
        }

        if (data.setupComplete) {
          setupCompletedRef.current = true;
          onOpen?.();
          return;
        }

        const serverContent = data.serverContent;
        if (!serverContent) return;

        if (serverContent.interrupted) {
          onInterrupted?.();
        }

        const outputTranscription = serverContent.outputTranscription;
        if (Array.isArray(outputTranscription)) {
          const parts = outputTranscription
            .map((item: { text?: string }) => (typeof item.text === 'string' ? item.text : ''))
            .filter(Boolean);
          if (parts.length && onTranscription) {
            onTranscription(parts.join(' '));
          }
        } else if (outputTranscription?.text && onTranscription) {
          onTranscription(String(outputTranscription.text));
        }

        const parts = serverContent.modelTurn?.parts ?? serverContent.parts;
        if (parts?.length) {
          for (const part of parts) {
            const audioB64 = part.inlineData?.data ?? part.audio?.data;
            if (audioB64 && onAudioChunk) {
              onAudioChunk(audioB64);
            }
          }
        }

        if (serverContent.turnComplete) {
          onTurnComplete?.();
        }
      } catch (e) {
        console.error('[useGeminiSocket] Failed to handle message:', e);
        onError?.(e);
      }
    },
    [onAudioChunk, onError, onInterrupted, onTranscription, onTurnComplete, onOpen],
  );

  const connect = useCallback(() => {
    if (socketRef.current || isConnectedRef.current) return;

    try {
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onopen = () => {
        isConnectedRef.current = true;
        setIsConnected(true);

        const setupMsg: Record<string, unknown> = {
          setup: {
            model: liveModel,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName } },
              },
            },
          },
        };

        if (systemInstruction && typeof systemInstruction === 'string') {
          (setupMsg.setup as any).systemInstruction = {
            parts: [{ text: systemInstruction }],
          };
        }

        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = (event) => {
        void handleMessage(event);
      };

      ws.onerror = (event) => {
        console.error('[useGeminiSocket] WebSocket error:', event);
        onError?.(event);
      };

      ws.onclose = (event) => {
        isConnectedRef.current = false;
        setupCompletedRef.current = false;
        setIsConnected(false);
        socketRef.current = null;
        onClose?.(event.code, event.reason);
      };
    } catch (e) {
      console.error('[useGeminiSocket] Failed to connect:', e);
      onError?.(e);
    }
  }, [handleMessage, liveModel, onClose, onError, systemInstruction, voiceName, wsUrl]);

  const disconnect = useCallback(() => {
    closeSocket(1000, 'Client disconnect');
  }, [closeSocket]);

  const sendAudioData = useCallback(
    (base64PCM: string) => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !setupCompletedRef.current) return;
      if (!base64PCM) return;

      const msg = {
        realtimeInput: {
          audio: {
            mimeType: 'audio/pcm;rate=16000',
            data: base64PCM,
          },
        },
      };

      try {
        ws.send(JSON.stringify(msg));
      } catch (e) {
        console.error('[useGeminiSocket] Failed to send audio chunk:', e);
        onError?.(e);
      }
    },
    [onError],
  );

  const sendClientText = useCallback(
    (text: string) => {
      const ws = socketRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !setupCompletedRef.current) return;
      const trimmed = text.trim();
      if (!trimmed) return;

      const msg = {
        clientContent: {
          turns: [
            {
              role: 'user',
              parts: [{ text: trimmed }],
            },
          ],
          turnComplete: true,
        },
      };

      try {
        ws.send(JSON.stringify(msg));
      } catch (e) {
        console.error('[useGeminiSocket] Failed to send client text:', e);
        onError?.(e);
      }
    },
    [onError],
  );

  useEffect(
    () => () => {
      try {
        closeSocket(1000, 'Component unmount');
      } catch {
        // ignore
      }
    },
    [closeSocket],
  );

  return {
    connect,
    disconnect,
    sendAudioData,
    sendClientText,
    isConnected,
  };
}

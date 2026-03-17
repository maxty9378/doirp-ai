'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { AudioStreamer } from './AudioStreamer';
import { useAudioStreamer } from './useAudioStreamer';
import { useGeminiSocket } from './useGeminiSocket';

export type VoiceSimulatorStatus = 'idle' | 'connecting' | 'ready' | 'error';

export interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export interface VoiceCallCheckpoint {
  id: string;
  label: string;
  done: boolean;
}

export interface UseVoiceSimulatorOptions {
  wsUrl: string;
  systemInstruction: string;
  voiceName: string;

  silenceNudgeAfterMs: number;
  silenceNudgeCooldownMs: number;
  silenceHardHangupMs: number;
  silenceNudgePhrases: string[];

  /** Предупреждение за ~15 сек до конца раунда (fallback — текущая строка) */
  roundEndingPrompt?: string | null;
  /** Шаблон нуджа при тишине; плейсхолдер {{phrase}} (fallback — текущая строка) */
  silenceNudgeTemplate?: string | null;

  checkpointsConfig: { id: string; label: string }[];
}

export interface UseVoiceSimulatorState {
  status: VoiceSimulatorStatus;
  error: string | null;
  userVolume: number;
  aiVolume: number;
  score: number;
  checkpoints: VoiceCallCheckpoint[];
  liveTranscript: TranscriptEntry[];
}

export interface UseVoiceSimulatorApi {
  connect: () => void;
  disconnect: () => void;
}

const SCORE_TAG_RE = /\[SCORE:\s*([+-]?\d+)\]/gi;
const CHECKPOINT_TAG_RE = /\[CHECKPOINT:\s*([A-Z0-9_]+)\]/gi;

const DEFAULT_ROUND_ENDING_PROMPT =
  'Через 15 секунд наш эфир на конференции подходит к концу. Кратко подведи итог: убедил ли тебя собеседник или нет, и скажи: "зрители нашего стрима сами сделают выводы". После этого естественно завершай разговор как в реальном живом общении на мероприятии, без служебных фраз про окончание звонка.';
const DEFAULT_SILENCE_NUDGE_TEMPLATE =
  'Собеседник молчит. Скажи коротко мотивационную фразу, например: "{{phrase}}".';

function cleanAiText(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(SCORE_TAG_RE, '');
  cleaned = cleaned.replace(CHECKPOINT_TAG_RE, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

function extractScoreDeltas(text: string): number[] {
  const deltas: number[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(SCORE_TAG_RE.source, SCORE_TAG_RE.flags);

  while ((match = re.exec(text)) !== null) {
    const raw = match[1];
    const n = Number(raw);
    if (Number.isFinite(n)) deltas.push(n);
  }

  return deltas;
}

function extractCheckpointIds(text: string): string[] {
  const ids: string[] = [];
  let match: RegExpExecArray | null;
  const re = new RegExp(CHECKPOINT_TAG_RE.source, CHECKPOINT_TAG_RE.flags);

  while ((match = re.exec(text)) !== null) {
    const id = String(match[1] || '').trim();
    if (id) ids.push(id);
  }

  return ids;
}

function pcmToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function useVoiceSimulator(
  options: UseVoiceSimulatorOptions,
): UseVoiceSimulatorState & UseVoiceSimulatorApi {
  const {
    wsUrl,
    systemInstruction,
    voiceName,
    silenceNudgeAfterMs,
    silenceNudgeCooldownMs,
    silenceHardHangupMs,
    silenceNudgePhrases,
    checkpointsConfig,
  } = options;

  const [status, setStatus] = useState<VoiceSimulatorStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [checkpoints, setCheckpoints] = useState<VoiceCallCheckpoint[]>(() =>
    checkpointsConfig.map((c) => ({ ...c, done: false })),
  );
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);

  const currentAiTurnTextRef = useRef<string>('');

  const lastBotEndRef = useRef<number>(0);
  const lastUserSpeechRef = useRef<number>(0);
  const silenceSinceRef = useRef<number>(0);
  const silenceCooldownRef = useRef<number>(0);
  const silenceNudgeCountRef = useRef<number>(0);
  const hangupScheduledRef = useRef(false);
  const roundStartRef = useRef<number | null>(null);
  const roundVerdictTriggeredRef = useRef(false);

  const playerRef = useRef<AudioStreamer | null>(null);

  const socketRef = useRef<ReturnType<typeof useGeminiSocket> | null>(null);

  const audio = useAudioStreamer({
    workletUrl: '/worklets/audio-processor.js',
    onMicData: (pcmBuffer) => {
      const api = socketRef.current;
      if (!api) return;
      const b64 = pcmToBase64(pcmBuffer);
      api.sendAudioData(b64);
    },
  });

  const { userVolume, aiVolume, isActive: audioActive } = audio;

  const socket = useGeminiSocket({
    wsUrl,
    systemInstruction,
    voiceName,
    onOpen: () => {
      setStatus('ready');
      setError(null);
      hangupScheduledRef.current = false;
      roundStartRef.current = Date.now();
      roundVerdictTriggeredRef.current = false;
      currentAiTurnTextRef.current = '';
    },
    onClose: () => {
      setStatus('idle');
    },
    onError: (err) => {
      console.error('[useVoiceSimulator] socket error:', err);
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Ошибка соединения с голосовым сервисом');
    },
    onAudioChunk: (base64Audio) => {
      if (!audio.outputContext) return;
      if (!playerRef.current) {
        const streamer = new AudioStreamer(audio.outputContext);
        playerRef.current = streamer;
        audio.attachOutputNode(streamer.analyser);
      }
      playerRef.current.addPCM16(base64Audio);
    },
    onTurnComplete: () => {
      const fullText = currentAiTurnTextRef.current.trim();
      if (!fullText) return;

      const deltas = extractScoreDeltas(fullText);
      const checkpointIds = extractCheckpointIds(fullText);
      const cleaned = cleanAiText(fullText);

      if (deltas.length) {
        setScore((prev) => prev + deltas.reduce((acc, n) => acc + n, 0));
      }

      if (checkpointIds.length) {
        setCheckpoints((prev) =>
          prev.map((cp) =>
            checkpointIds.includes(cp.id)
              ? {
                  ...cp,
                  done: true,
                }
              : cp,
          ),
        );
      }

      if (cleaned) {
        setLiveTranscript((prev) => [...prev, { role: 'ai', text: cleaned }]);
      }

      currentAiTurnTextRef.current = '';
      lastBotEndRef.current = Date.now();
    },
    onTranscription: (text) => {
      if (!text) return;
      currentAiTurnTextRef.current += (currentAiTurnTextRef.current ? ' ' : '') + text;
    },
    onInterrupted: () => {
      currentAiTurnTextRef.current = '';
    },
  });

  socketRef.current = socket;

  const connect = useCallback(() => {
    if (!audioActive) {
      audio.startAudio().catch((e) => {
        console.error('[useVoiceSimulator] failed to start audio:', e);
        setError(e instanceof Error ? e.message : 'Не удалось включить микрофон');
        setStatus('error');
      });
    }
    setStatus('connecting');
    socket.connect();
  }, [audio, audioActive, socket]);

  const disconnect = useCallback(() => {
    hangupScheduledRef.current = true;
    socket.disconnect();
    audio.stopAudio();
    playerRef.current?.stop();
    playerRef.current = null;
    setStatus('idle');
  }, [audio, socket]);

  useEffect(() => {
    if (userVolume > 10) {
      lastUserSpeechRef.current = Date.now();
    }
  }, [userVolume]);

  useEffect(() => {
    if (status !== 'ready') return;

    const id = window.setInterval(() => {
      const now = Date.now();

      if (silenceHardHangupMs && roundStartRef.current && !hangupScheduledRef.current) {
        const elapsed = now - roundStartRef.current;
        const remaining = silenceHardHangupMs - elapsed;

        if (!roundVerdictTriggeredRef.current && remaining <= 15_000 && remaining > 0) {
          roundVerdictTriggeredRef.current = true;
          const prompt = options.roundEndingPrompt?.trim() || DEFAULT_ROUND_ENDING_PROMPT;
          socket.sendClientText(prompt);
        }

        if (remaining <= 0) {
          hangupScheduledRef.current = true;
          disconnect();
          return;
        }
      }

      const vol = userVolume;
      if (vol < 3) {
        if (silenceSinceRef.current === 0) {
          silenceSinceRef.current = now;
        } else {
          const silenceDuration = now - silenceSinceRef.current;
          const lastBotEnd = lastBotEndRef.current;
          const userSpokeAfterBot = lastUserSpeechRef.current > lastBotEnd;

          if (
            lastBotEnd > 0 &&
            !userSpokeAfterBot &&
            now - lastBotEnd >= silenceNudgeAfterMs &&
            now >= silenceCooldownRef.current &&
            silenceNudgePhrases.length > 0
          ) {
            const phrase =
              silenceNudgePhrases[Math.floor(Math.random() * silenceNudgePhrases.length)];
            const template =
              options.silenceNudgeTemplate?.trim() || DEFAULT_SILENCE_NUDGE_TEMPLATE;
            socket.sendClientText(template.replace(/\{\{phrase\}\}/g, phrase));
            silenceCooldownRef.current = now + silenceNudgeCooldownMs;
            silenceNudgeCountRef.current += 1;
          }

          if (silenceDuration >= silenceHardHangupMs && !hangupScheduledRef.current) {
            hangupScheduledRef.current = true;
            disconnect();
            return;
          }
        }
      } else {
        silenceSinceRef.current = 0;
      }
    }, 500);

    return () => window.clearInterval(id);
  }, [
    disconnect,
    silenceHardHangupMs,
    silenceNudgeAfterMs,
    silenceNudgeCooldownMs,
    silenceNudgePhrases,
    socket,
    status,
    userVolume,
  ]);

  const state: UseVoiceSimulatorState = useMemo(
    () => ({
      status,
      error,
      userVolume,
      aiVolume,
      score,
      checkpoints,
      liveTranscript,
    }),
    [status, error, userVolume, aiVolume, score, checkpoints, liveTranscript],
  );

  return {
    ...state,
    connect,
    disconnect,
  };
}


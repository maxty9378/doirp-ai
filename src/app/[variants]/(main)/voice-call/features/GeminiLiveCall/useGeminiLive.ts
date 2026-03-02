'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { AudioStreamer } from './AudioStreamer';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-latest';

const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;

const USER_VOLUME_SCALE = 500;
const AI_VOLUME_SCALE = 0.15;
const VOLUME_SMOOTH = 0.25;
const VOLUME_DECAY = 0.85;

export interface GeminiLiveConfig {
  apiKey: string;
  systemInstruction: string;
  voiceName: string;
}

const PATIENCE_INITIAL = 100;
const MUMBLE_VOLUME_THRESHOLD = 5;
const MUMBLE_DURATION_MS = 10_000;
const MUMBLE_COOLDOWN_MS = 30_000;
const SILENCE_HARD_HANGUP_MS = 45_000;
const MONOLOGUE_DURATION_MS = 15_000;
const MONOLOGUE_VOLUME_THRESHOLD = 10;
const AMBIENT_AUDIO_URL = '/audio/ambient-store.mp3?v=20260302';

/** Очищает служебные теги в тексте от модели */
function cleanAiText(text: string): string {
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replace(/\[CURRENT_SCORE:\s*-?\d+\]/gi, '');
  cleaned = cleaned.replace(/\s+/g, ' ');
  return cleaned.trim();
}

export interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export type HangUpReason = 'abuse' | 'silence' | 'ai' | 'success' | null;

export interface VoiceCallCheckpoint {
  done: boolean;
  id: 'empathy' | 'value' | 'nextStep';
  label: string;
}

const CHECKPOINTS_TEMPLATE: VoiceCallCheckpoint[] = [
  { done: false, id: 'empathy', label: 'Снять напряжение: признать эмоции клиента' },
  { done: false, id: 'value', label: 'Дать аргумент выгоды без прямой скидки' },
  { done: false, id: 'nextStep', label: 'Зафиксировать следующий шаг (встреча/пробная поставка)' },
];

const EMPATHY_RE = /\b(понима(ю|ем)|слышу вас|вы правы|согласен|да, неприятно|понимаю вашу позицию)\b/i;
const VALUE_RE = /\b(марж|прибыл|оборот|доход|выручк|фейсинг|полк|оборачиваем|трафик|чек|без скидк)\b/i;
const NEXT_STEP_RE = /\b(давайте|предлагаю|встреч|созвон|тест|пробн(ая|ую)? поставк|заказ|следующ(ий|ая) шаг)\b/i;
const INSULT_RE = /\b(дура|идиот|туп(ая|ой|ой)|заткнись|пош(е|ё)л|урод|дебил|клоун)\b/i;
const HANGUP_PHRASE_RE = /кладу\s+трубку/i;

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const evaluateCheckpoints = (transcript: TranscriptEntry[]): VoiceCallCheckpoint[] => {
  const userText = transcript
    .filter((entry) => entry.role === 'user')
    .map((entry) => entry.text.toLowerCase())
    .join(' ');

  return CHECKPOINTS_TEMPLATE.map((checkpoint) => {
    if (checkpoint.id === 'empathy') return { ...checkpoint, done: EMPATHY_RE.test(userText) };
    if (checkpoint.id === 'value') return { ...checkpoint, done: VALUE_RE.test(userText) };
    return { ...checkpoint, done: NEXT_STEP_RE.test(userText) };
  });
};

const estimateUserScoreDelta = (text: string) => {
  const lower = text.toLowerCase();
  let delta = 0;
  if (EMPATHY_RE.test(lower)) delta += 4;
  if (VALUE_RE.test(lower)) delta += 5;
  if (NEXT_STEP_RE.test(lower)) delta += 6;
  if (/\b(скидк|дешевл|сбросим цену)\b/i.test(lower) && !/\bбез скидк\b/i.test(lower)) delta -= 4;
  if (INSULT_RE.test(lower)) delta -= 20;
  return clamp(delta, -20, 12);
};

export interface UseGeminiLiveOptions {
  agentId?: string;
  onCallEnd?: (transcript: TranscriptEntry[]) => void;
  onError?: (message: string) => void;
  systemInstruction: string;
  voiceName?: string;
}

export function useGeminiLive({
  agentId = 'voice-simulator-lpr',
  onCallEnd,
  onError,
  systemInstruction,
  voiceName = 'Charon',
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [score, setScore] = useState(0);
  const [patience, setPatience] = useState(PATIENCE_INITIAL);
  const [hangUpByLpr, setHangUpByLpr] = useState(false);
  const [hangUpReason, setHangUpReason] = useState<HangUpReason>(null);
  const [subtitle, setSubtitle] = useState('');
  const [checkpoints, setCheckpoints] = useState<VoiceCallCheckpoint[]>(CHECKPOINTS_TEMPLATE);

  // Внутренний чат тренажера
  const [liveTranscript, setLiveTranscript] = useState<TranscriptEntry[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const configFetchedRef = useRef(false);
  const configRef = useRef<GeminiLiveConfig | null>(null);
  const lastAgentIdRef = useRef<string>(agentId);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const userVolumeTargetRef = useRef(0);
  const userVolumeCurrentRef = useRef(0);
  const aiVolumeCurrentRef = useRef(0);
  const freqDataRef = useRef<Uint8Array | null>(null);

  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const currentAiTurnTextRef = useRef('');
  const pendingScoreDeltaRef = useRef(0);

  const recognitionRef = useRef<{ stop: () => void; start: () => void } | null>(null);
  const recognitionActiveRef = useRef(false);
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  const connectionLockRef = useRef(false);

  const lowVolumeSinceRef = useRef<number>(0);
  const mumbleCooldownRef = useRef<number>(0);
  const lastBotEndRef = useRef<number>(0);
  const monologueTriggeredRef = useRef(false);
  const silenceSinceRef = useRef<number>(0);
  const silenceCooldownRef = useRef<number>(0);
  const silenceNudgeCountRef = useRef(0);
  const disconnectRef = useRef<() => void>(() => {});
  const hangUpToneRef = useRef<() => void>(() => {});
  const hangupScheduledRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const autoFinishTriggeredRef = useRef(false);
  const aiSpeakingSinceRef = useRef<number>(0);

  const playTone = useCallback((freq: number, duration: number, startTime: number) => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = freq;
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.15, startTime);
    gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
    osc.start(startTime);
    osc.stop(startTime + duration);
  }, []);

  const playConnectionTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    playTone(880, 0.12, t);
    playTone(1100, 0.12, t + 0.18);
  }, [playTone]);

  const playDisconnectTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    playTone(440, 0.2, ctx.currentTime);
  }, [playTone]);

  const playHangUpTone = useCallback(() => {
    const ctx = playContextRef.current;
    if (!ctx || ctx.state === 'closed') return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 180;
    osc.type = 'sine';
    osc.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.12, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
    osc.start(t);
    osc.stop(t + 0.08);
  }, []);

  const reportError = useCallback(
    (msg: string) => {
      setStatus('error');
      setErrorMessage(msg);
      onError?.(msg);
    },
    [onError],
  );

  const sendClientText = useCallback((text: string) => {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: 'user', parts: [{ text }] }], turnComplete: true },
      }),
    );
  }, []);

  const finalizeByLpr = useCallback(
    (reason: Exclude<HangUpReason, null>, message: string, delayMs = 1200, markAsError = true) => {
      if (hangupScheduledRef.current) return;
      hangupScheduledRef.current = true;
      setHangUpReason(reason);
      setHangUpByLpr(true);
      if (markAsError) {
        reportError(message);
      } else {
        setErrorMessage(message);
        setSubtitle(message);
      }
      setTimeout(() => {
        hangUpToneRef.current();
        disconnectRef.current();
      }, delayMs);
    },
    [reportError],
  );

  const recalcCheckpoints = useCallback(() => {
    const next = evaluateCheckpoints(transcriptRef.current);
    setCheckpoints(next);
    return next;
  }, []);

  const maybeAutoFinish = useCallback(
    (latestScore: number) => {
      if (status !== 'ready' || autoFinishTriggeredRef.current || hangupScheduledRef.current) return;

      const next = recalcCheckpoints();
      const allDone = next.every((item) => item.done);
      const enoughDialogue = transcriptRef.current.length >= 6;
      if (!allDone || !enoughDialogue || latestScore < 12) return;

      autoFinishTriggeredRef.current = true;
      sendClientText(
        'Клиент убедил тебя. Коротко зафиксируй следующий шаг, скажи что работа продолжается и закончи фразой "кладу трубку".',
      );

      setTimeout(() => {
        if (hangupScheduledRef.current || status !== 'ready') return;
        finalizeByLpr('success', 'Звонок завершен: клиент согласился на следующий шаг.', 1200, false);
      }, 9000);
    },
    [finalizeByLpr, recalcCheckpoints, sendClientText, status],
  );

  const connect = useCallback(async () => {
    if (connectionLockRef.current) return;
    connectionLockRef.current = true;

    try {
      setStatus('connecting');
      setErrorMessage(null);
      isSetupCompleteRef.current = false;
      setScore(0);
      setPatience(PATIENCE_INITIAL);
      setHangUpByLpr(false);
      setHangUpReason(null);
      setSubtitle('');
      setCheckpoints(CHECKPOINTS_TEMPLATE);

      transcriptRef.current = [];
      setLiveTranscript([]);

      currentAiTurnTextRef.current = '';
      pendingScoreDeltaRef.current = 0;
      hangupScheduledRef.current = false;
      autoFinishTriggeredRef.current = false;
      aiSpeakingSinceRef.current = 0;
      silenceNudgeCountRef.current = 0;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const Ctx =
        window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!playContextRef.current || playContextRef.current.state === 'closed') {
        playContextRef.current = new Ctx({ sampleRate: PCM_OUT_SAMPLE_RATE });
      }
      const playContext = playContextRef.current;
      if (!streamerRef.current) {
        const streamer = new AudioStreamer(playContext);
        streamer.onPlayStateChange = (playing) => {
          isPlayingRef.current = playing;
        };
        streamerRef.current = streamer;
        analyserRef.current = streamer.analyser;
        freqDataRef.current = new Uint8Array(streamer.analyser.frequencyBinCount);
      }
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new Ctx({ sampleRate: PCM_IN_SAMPLE_RATE });
      }

      if (playContextRef.current.state === 'suspended') await playContextRef.current.resume();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();

      try {
        if (!ambientRef.current) {
          const ambient = new Audio(AMBIENT_AUDIO_URL);
          ambient.loop = true;
          ambient.volume = 0.15;
          ambient.preload = 'auto';
          ambientRef.current = ambient;
          ambient.play().catch(() => {
            const retry = () => {
              ambient.play().catch(() => {});
            };
            window.addEventListener('pointerdown', retry, { once: true });
          });
        } else {
          ambientRef.current.play().catch(() => {});
        }
      } catch {}

      if (!configFetchedRef.current || !configRef.current || lastAgentIdRef.current !== agentId) {
        const res = await fetch(`/api/voice-call/config?agentId=${encodeURIComponent(agentId)}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Ошибка загрузки конфига: ${res.status}`);
        lastAgentIdRef.current = agentId;
        configRef.current = await res.json();
        configFetchedRef.current = true;
      }

      const config = configRef.current;
      if (!config?.apiKey) throw new Error('Нет API-ключа Google.');

      const url = `${GEMINI_LIVE_WS}?key=${encodeURIComponent(config.apiKey)}`;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      const sendStartTrigger = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
          wsRef.current.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: 'Начинай диалог. Скажи первую реплику от лица Марины Ивановны.' }],
                  },
                ],
                turnComplete: true,
              },
            }),
          );
        }
      };

      ws.onopen = () => {
        const sysInst = config.systemInstruction || systemInstruction;
        const setupMsg: Record<string, unknown> = {
          setup: {
            model: LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || voiceName } },
              },
            },
          },
        };
        if (sysInst) (setupMsg.setup as Record<string, unknown>).systemInstruction = { parts: [{ text: sysInst }] };
        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = async (event: MessageEvent) => {
        try {
          const raw =
            typeof event.data === 'string'
              ? event.data
              : await (event.data instanceof Blob
                  ? event.data.text()
                  : new TextDecoder().decode(event.data as ArrayBuffer));
          const data = JSON.parse(raw);

          if (data.error?.message) {
            reportError(data.error.message);
            return;
          }

          if (data.setupComplete) {
            isSetupCompleteRef.current = true;
            setStatus('ready');
            playConnectionTone();
            sendStartTrigger();
            return;
          }

          const serverContent = data.serverContent;
          if (!serverContent) return;

          if (serverContent.interrupted) {
            const interruptedText = currentAiTurnTextRef.current.trim();
            if (interruptedText) {
              transcriptRef.current.push({ role: 'ai', text: interruptedText });
              setLiveTranscript([...transcriptRef.current]);
              recalcCheckpoints();
            }
            currentAiTurnTextRef.current = '';
            pendingScoreDeltaRef.current = 0;
            return;
          }

          const parts = serverContent.modelTurn?.parts ?? serverContent.parts;
          if (parts?.length) {
            for (const part of parts) {
              const audioB64 = part.inlineData?.data ?? part.audio?.data;
              if (audioB64) streamerRef.current?.addPCM16(audioB64);

              if (part.text) {
                const textChunk = part.text;

                if (HANGUP_PHRASE_RE.test(textChunk) && !hangupScheduledRef.current) {
                  finalizeByLpr('ai', 'ЛПР завершил звонок.', 3500, true);
                }

                const scoreMatches = textChunk.matchAll(/\[CURRENT_SCORE:\s*([-\d]+)\]/g);
                for (const match of scoreMatches) {
                  const val = Number.parseInt(match[1] || '', 10);
                  if (!Number.isNaN(val)) pendingScoreDeltaRef.current += val;
                }
              }
            }
          }

          const rawTranscriptionText = serverContent.outputTranscription?.text ?? '';
          const transcriptionScoreMatches = rawTranscriptionText.matchAll(/\[CURRENT_SCORE:\s*([-\d]+)\]/g);
          for (const match of transcriptionScoreMatches) {
            const val = Number.parseInt(match[1] || '', 10);
            if (!Number.isNaN(val)) pendingScoreDeltaRef.current += val;
          }

          const transcriptionText = cleanAiText(rawTranscriptionText);
          if (transcriptionText) {
            currentAiTurnTextRef.current += transcriptionText + ' ';
            setSubtitle(transcriptionText);
            if (HANGUP_PHRASE_RE.test(transcriptionText) && !hangupScheduledRef.current) {
              finalizeByLpr('ai', 'ЛПР завершил звонок.', 1500, true);
            }
          }

          if (serverContent.turnComplete) {
            const turnText = currentAiTurnTextRef.current.trim();

            if (pendingScoreDeltaRef.current !== 0) {
              setScore((prev) => {
                const nextScore = clamp(prev + pendingScoreDeltaRef.current, -50, 50);
                maybeAutoFinish(nextScore);
                return nextScore;
              });
              pendingScoreDeltaRef.current = 0;
            }

            if (turnText) {
              transcriptRef.current.push({ role: 'ai', text: turnText });
              setLiveTranscript([...transcriptRef.current]);
              recalcCheckpoints();
            }
            currentAiTurnTextRef.current = '';
          }
        } catch (e) {
          console.warn('Ошибка парсинга:', e);
        }
      };

      ws.onerror = () => reportError('Ошибка WebSocket. Проверьте интернет.');
      ws.onclose = (event) => {
        wsRef.current = null;
        if (!isSetupCompleteRef.current) {
          connectionLockRef.current = false;
          reportError(
            `Live-соединение закрыто до старта (code: ${event.code}). Проверьте VPN/антивирус/прокси и доступ к generativelanguage.googleapis.com.`,
          );
          return;
        }
        setStatus('idle');
      };

      const audioContext = audioContextRef.current!;
      await audioContext.audioWorklet.addModule('/worklets/audio-processor.js');
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (event: MessageEvent<{ buffer: ArrayBuffer; volume: number }>) => {
        const { buffer, volume } = event.data;
        userVolumeTargetRef.current = Math.min(100, volume * USER_VOLUME_SCALE);
        const wsState = wsRef.current;
        if (!wsState || wsState.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current) return;
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        wsState.send(
          JSON.stringify({
            realtimeInput: { mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: btoa(binary) }] },
          }),
        );
      };

      const source = audioContext.createMediaStreamSource(streamRef.current!);
      sourceRef.current = source;
      source.connect(workletNode);
    } catch (err) {
      connectionLockRef.current = false;
      reportError(err instanceof Error ? err.message : 'Не удалось подключиться');
    }
  }, [
    agentId,
    systemInstruction,
    voiceName,
    reportError,
    playConnectionTone,
    finalizeByLpr,
    maybeAutoFinish,
    recalcCheckpoints,
  ]);

  const disconnect = useCallback(() => {
    const transcript = [...transcriptRef.current];
    if (transcript.length > 0 && onCallEnd) onCallEnd(transcript);

    transcriptRef.current = [];
    setLiveTranscript([]);
    pendingScoreDeltaRef.current = 0;
    recognitionActiveRef.current = false;

    try {
      recognitionRef.current?.stop();
    } catch (_) {}
    recognitionRef.current = null;

    ambientRef.current?.pause();
    ambientRef.current = null;

    playDisconnectTone();

    streamerRef.current?.stop();
    streamerRef.current = null;

    if (workletNodeRef.current && sourceRef.current) {
      try {
        sourceRef.current.disconnect();
        workletNodeRef.current.disconnect();
      } catch (_) {}
    }
    workletNodeRef.current = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    wsRef.current?.close();

    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (playContextRef.current) {
      playContextRef.current.close().catch(() => {});
      playContextRef.current = null;
    }

    sourceRef.current = null;
    wsRef.current = null;
    isPlayingRef.current = false;
    isSetupCompleteRef.current = false;
    userVolumeTargetRef.current = 0;
    userVolumeCurrentRef.current = 0;
    aiVolumeCurrentRef.current = 0;
    connectionLockRef.current = false;
    hangupScheduledRef.current = false;
    autoFinishTriggeredRef.current = false;
    aiSpeakingSinceRef.current = 0;

    setStatus('idle');
    setErrorMessage(null);
    setUserVolume(0);
    setAiVolume(0);
    setScore(0);
    setPatience(PATIENCE_INITIAL);
    setCheckpoints(CHECKPOINTS_TEMPLATE);
    setHangUpReason(null);
  }, [playDisconnectTone, onCallEnd]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);
  useEffect(() => {
    hangUpToneRef.current = playHangUpTone;
  }, [playHangUpTone]);

  useEffect(() => {
    if (status !== 'ready') return;

    const id = setInterval(() => {
      const vol = userVolumeCurrentRef.current;
      const now = Date.now();

      if (isPlayingRef.current) {
        if (aiVolumeCurrentRef.current >= MONOLOGUE_VOLUME_THRESHOLD) {
          if (aiSpeakingSinceRef.current === 0) aiSpeakingSinceRef.current = now;

          const monologueDuration = now - aiSpeakingSinceRef.current;
          if (monologueDuration >= MONOLOGUE_DURATION_MS && !monologueTriggeredRef.current) {
            monologueTriggeredRef.current = true;
            streamerRef.current?.stop();
            sendClientText('Отвечай короче: 1-2 предложения и по сути, затем жди ответ собеседника.');
          }
        }

        lowVolumeSinceRef.current = 0;
        silenceSinceRef.current = 0;
        silenceNudgeCountRef.current = 0;
        return;
      }

      if (aiSpeakingSinceRef.current > 0) {
        aiSpeakingSinceRef.current = 0;
        lastBotEndRef.current = now;
        monologueTriggeredRef.current = false;
      }

      if (vol < 3) {
        lowVolumeSinceRef.current = 0;
        if (silenceSinceRef.current === 0) {
          silenceSinceRef.current = now;
        } else {
          if (now - silenceSinceRef.current >= 15000 && now >= silenceCooldownRef.current) {
            sendClientText('Собеседник молчит. Спроси: "Алло, вы меня вообще слушаете?"');
            silenceCooldownRef.current = now + 15000;
            silenceNudgeCountRef.current += 1;
          }

          if (now - silenceSinceRef.current >= SILENCE_HARD_HANGUP_MS && !hangupScheduledRef.current) {
            finalizeByLpr('silence', 'Марина Ивановна завершила звонок: слишком долгое молчание.');
            return;
          }
        }
      } else if (vol >= 3 && vol < MUMBLE_VOLUME_THRESHOLD) {
        silenceSinceRef.current = 0;
        if (lowVolumeSinceRef.current === 0) {
          lowVolumeSinceRef.current = now;
        } else if (
          now - lowVolumeSinceRef.current >= MUMBLE_DURATION_MS &&
          now >= mumbleCooldownRef.current
        ) {
          sendClientText('Собеседник говорит очень тихо и неуверенно. Сделай ему жесткое замечание.');
          mumbleCooldownRef.current = now + MUMBLE_COOLDOWN_MS;
          lowVolumeSinceRef.current = 0;
        }
      } else {
        lowVolumeSinceRef.current = 0;
        silenceSinceRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(id);
  }, [status, sendClientText, finalizeByLpr]);

  useEffect(() => {
    if (status !== 'connecting' && status !== 'ready') return;
    let rafId = 0;
    const tick = () => {
      const userTarget = userVolumeTargetRef.current;
      const userCur = userVolumeCurrentRef.current;
      userVolumeCurrentRef.current = userCur + (userTarget - userCur) * VOLUME_SMOOTH;
      setUserVolume(Math.round(userVolumeCurrentRef.current));

      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;
      if (analyser && freqData) {
        if (isPlayingRef.current) {
          analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
          let sum = 0;
          for (let i = 0; i < freqData.length; i++) sum += freqData[i];
          const aiTarget = Math.min(100, (sum / freqData.length) * AI_VOLUME_SCALE);
          const aiCur = aiVolumeCurrentRef.current;
          aiVolumeCurrentRef.current = aiCur + (aiTarget - aiCur) * VOLUME_SMOOTH;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        } else {
          aiVolumeCurrentRef.current *= VOLUME_DECAY;
          setAiVolume(Math.round(aiVolumeCurrentRef.current));
        }
      }

      if (ambientRef.current) {
        const targetAmbient = isPlayingRef.current ? 0.05 : 0.15;
        ambientRef.current.volume += (targetAmbient - ambientRef.current.volume) * 0.05;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  useEffect(() => {
    if (status !== 'ready') return;
    const win = typeof window !== 'undefined' ? (window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown }) : null;
    const SR = win?.SpeechRecognition ?? win?.webkitSpeechRecognition;
    if (!SR) return;

    const recognition = new (SR as any)();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'ru-RU';

    recognition.onresult = (e: unknown) => {
      const ev = e as { results?: Array<{ isFinal?: boolean; 0?: { transcript?: string } }>; resultIndex?: number } | undefined;
      const idx = ev?.resultIndex ?? 0;
      const result = ev?.results?.[idx];
      if (!result?.isFinal) return;
      const text = result[0]?.transcript?.trim();

      const lastEntry = transcriptRef.current[transcriptRef.current.length - 1];
      if (text && text.length > 2 && lastEntry?.text !== text) {
        transcriptRef.current.push({ role: 'user', text });
        setLiveTranscript([...transcriptRef.current]);
        const delta = estimateUserScoreDelta(text);
        if (delta !== 0) {
          setScore((prev) => {
            const nextScore = clamp(prev + delta, -50, 50);
            maybeAutoFinish(nextScore);
            return nextScore;
          });
          setPatience((prev) => clamp(prev + delta, 0, 100));
        }
        recalcCheckpoints();

        if (INSULT_RE.test(text) && !hangupScheduledRef.current) {
          sendClientText(
            'Собеседник тебя оскорбил. Ответь резко, пригрози проблемами и закончи фразой "Я кладу трубку".',
          );
          finalizeByLpr('abuse', 'ЛПР завершил звонок из-за оскорбления.', 2400, true);
        }
      }
    };

    recognition.onerror = () => {};
    recognition.onend = () => {
      if (recognitionActiveRef.current && recognitionRef.current) {
        setTimeout(() => {
          try {
            if (recognitionActiveRef.current) recognition.start();
          } catch (_) {}
        }, 50);
      }
    };

    recognitionActiveRef.current = true;
    recognition.start();
    recognitionRef.current = recognition;

    return () => {
      recognitionActiveRef.current = false;
      try {
        recognition.stop();
      } catch (_) {}
      recognitionRef.current = null;
    };
  }, [status, finalizeByLpr, maybeAutoFinish, recalcCheckpoints, sendClientText]);

  const getTranscript = useCallback(() => [...transcriptRef.current], []);

  return {
    connect,
    disconnect,
    errorMessage,
    hangUpByLpr,
    hangUpReason,
    status,
    userVolume,
    aiVolume,
    score,
    subtitle,
    patience,
    checkpoints,
    getTranscript,
    liveTranscript,
    analyserRef,
  };
}

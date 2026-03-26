'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useUserStore } from '@/store/user';
import { stripEnglishReasoning } from '@/utils/stripEnglishReasoning';
import { isLikelyEcho } from '@/utils/voiceCallEchoFilter';

import { AudioStreamer } from './AudioStreamer';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';

/** Модель для Live API (голос): gemini-2.0-flash-exp не поддерживает bidiGenerateContent */
const LIVE_MODEL = 'models/gemini-2.5-flash-native-audio-preview-12-2025';

const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;

const USER_VOLUME_SCALE = 500;
const AI_VOLUME_SCALE = 0.15;
const VOLUME_SMOOTH = 0.25;
const VOLUME_DECAY = 0.85;
const USER_NOISE_MARGIN = 6;
const USER_AUDIO_GATE_HOLD_MS = 650;
const NOISE_FLOOR_RISE_ALPHA = 0.02;
const NOISE_FLOOR_FALL_ALPHA = 0.15;

export interface GeminiLiveConfig {
  apiKey: string;
  assistantLabel?: string;
  autoSuccessPrompt?: string | null;
  /** ID чекпоинтов для парсинга тегов [CHECKPOINT: ...] от LLM (порядок соответствует goals) */
  checkpointIds?: string[];
  contextWindow?: number;
  enableCheckpoints?: boolean;
  enableScoring?: boolean;
  /** URL WebSocket-прокси (когда задан VOICE_CALL_WS_PROXY_URL), иначе клиент подключается к Google напрямую */
  geminiWsUrl?: string | null;
  /** Массив целей сценария из редактора (используем как чекпоинты в UI) */
  goals?: string[];
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  openingInstruction?: string | null;
  quietSpeakerNudge?: string | null;
  roundEndingPrompt?: string | null;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabelsConfig | null;
  sessionDurationMs?: number;
  shortAnswerNudge?: string | null;
  showIntroDialog?: boolean | null;
  silenceHardHangupMs?: number;
  silenceNudgeAfterMs?: number;
  silenceNudgeCooldownMs?: number;
  silenceNudgePhrases?: string[];
  silenceNudgeTemplate?: string | null;
  systemInstruction: string;
  userLabel?: string;
  voiceName: string;
}

export interface ScoreLevelLabelsConfig {
  high?: string;
  low?: string;
  mid?: string;
}

export interface GeminiLiveUIConfig {
  assistantLabel: string;
  autoSuccessPrompt?: string | null;
  /** ID чекпоинтов для парсинга тегов [CHECKPOINT: ...] от LLM */
  checkpointIds: string[];
  contextWindow: number;
  enableCheckpoints: boolean;
  enableScoring: boolean;
  /** Цели сценария, заданные в редакторе */
  goals: string[];
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  openingInstruction?: string | null;
  quietSpeakerNudge?: string | null;
  roundEndingPrompt?: string | null;
  scoreDisplayLabel?: string | null;
  scoreLevelLabels?: ScoreLevelLabelsConfig | null;
  sessionDurationMs: number;
  shortAnswerNudge?: string | null;
  showIntroDialog: boolean;
  silenceHardHangupMs: number;
  silenceNudgeAfterMs: number;
  silenceNudgeCooldownMs: number;
  silenceNudgePhrases: string[];
  silenceNudgeTemplate?: string | null;
  userLabel: string;
}

const PATIENCE_INITIAL = 100;
const MUMBLE_VOLUME_THRESHOLD = 5;
const MUMBLE_DURATION_MS = 10_000;
const MUMBLE_COOLDOWN_MS = 30_000;
// Чем ниже порог — тем легче «перебить» ИИ и тем меньше риск, что ИИ "не слышит" пользователя.
// Слишком низкий порог увеличит шанс, что в микрофон попадёт эхо из динамиков.
const BARGE_IN_VOLUME_THRESHOLD = 2.5;
const BARGE_IN_SUSTAIN_MS = 90;
const BARGE_IN_COOLDOWN_MS = 150;
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
// По умолчанию раунд длится 5 минут
const DEFAULT_SILENCE_HARD_HANGUP_MS = 300_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = ['Алло, вы меня вообще слушаете?'];
const DEFAULT_ROUND_ENDING_PROMPT =
  'Через 15 секунд наш эфир на конференции подходит к концу. Кратко подведи итог: убедил ли тебя собеседник или нет, и скажи: "зрители нашего стрима сами сделают выводы". После этого естественно завершай разговор как в реальном живом общении на мероприятии, без служебных фраз про окончание звонка.';
const DEFAULT_SILENCE_NUDGE_TEMPLATE = 'Собеседник молчит. Скажи коротко: "{{phrase}}".';
const DEFAULT_SHORT_ANSWER_NUDGE =
  'Отвечай короче: 1-2 предложения и по сути, затем жди ответ собеседника.';
const DEFAULT_QUIET_SPEAKER_NUDGE =
  'Собеседник говорит очень тихо и неуверенно. Сделай ему жесткое замечание.';
const DEFAULT_AUTO_SUCCESS_PROMPT =
  'Маркетолог блестяще справился с напором, сохранил лицо бренда и не оставил места для манипуляций. Признай поражение иронично, например: "Ладно, вы хорошо подготовились к эфиру... Но мы ещё проверим ваши слова. На этом всё, возвращаемся в студию!" и естественно заверши диалог в стиле прямого эфира.';
const MONOLOGUE_DURATION_MS = 15_000;
const MONOLOGUE_VOLUME_THRESHOLD = 10;
const AMBIENT_AUDIO_URL = '/audio/ambient-store.mp3?v=20260302';

/** Очищает служебные теги в тексте от модели */
function cleanAiText(text: string, options?: { stripEnglishReasoning?: boolean }): string {
  let cleaned = text.replaceAll(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*SCORE\s*:|SCORE\s*:)\s*(?:[-+]\s*)?\d+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*CHECKPOINT\s*:|CHECKPOINT\s*:)\s*[A-Z_]+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/\s+/g, ' ');
  if (options?.stripEnglishReasoning !== false) cleaned = stripEnglishReasoning(cleaned);
  return cleaned.trim();
}

export interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export type HangUpReason = 'abuse' | 'silence' | 'ai' | 'success' | null;

export interface VoiceCallCheckpoint {
  done: boolean;
  id: 'STRESS_CONTROL' | 'FACT_CHECK' | 'REPUTATION_SAVE' | string;
  label: string;
}

const USER_ECHO_COOLDOWN_MS = 900;
const USER_AUDIO_ACTIVITY_THRESHOLD = 5;
const USER_AUDIO_ACTIVITY_WINDOW_MS = 2500;
const USER_UTTERANCE_BREAK_MS = 2500;

const getLastAiText = (items: TranscriptEntry[], fallback = '') => {
  for (let i = items.length - 1; i >= 0; i--) {
    if (items[i]?.role === 'ai') return items[i]?.text || fallback;
  }
  return fallback;
};

const mergeLiveTranscriptionText = (prev: string, next: string) => {
  const a = prev.trim();
  const b = next.trim();
  if (!b) return a;
  if (!a) return b;
  
  if (b.startsWith(a)) return b;
  if (a.startsWith(b)) return a;

  // Если Gemini присылает корректировку (например, "я пошел" -> "Я пошёл."), 
  // часто новые варианты очень похожи или содержат перекрытие.
  
  const aLower = a.toLowerCase();
  const bLower = b.toLowerCase();
  
  // Проверка полного перекрытия без учета регистра и пунктуации
  const cleanA = aLower.replaceAll(/[.,!?:;()]/g, '').replaceAll(/\s+/g, ' ');
  const cleanB = bLower.replaceAll(/[.,!?:;()]/g, '').replaceAll(/\s+/g, ' ');
  
  // Если новая строка содержит старую или наоборот
  if (cleanB.startsWith(cleanA) || cleanB.includes(cleanA)) return b;
  if (cleanA.startsWith(cleanB)) return a;
  
  // Проверка перекрытия конца A и начала B (suffix/prefix overlap)
  // Ищем совпадение от 15 символов или целых слов
  const wordsA = a.split(/\s+/);
  const wordsB = b.split(/\s+/);
  
  // Пробуем найти пересечение по словам (от 1 слова и больше)
  let maxOverlap = 0;
  for (let i = 1; i <= Math.min(wordsA.length, wordsB.length); i++) {
    const suffixA = wordsA.slice(-i).join(' ').toLowerCase().replaceAll(/[.,!?:;()]/g, '');
    const prefixB = wordsB.slice(0, i).join(' ').toLowerCase().replaceAll(/[.,!?:;()]/g, '');
    
    // Сравниваем нормализованные строки. Если совпадают, фиксируем длину перекрытия
    if (suffixA && prefixB && suffixA === prefixB) {
      maxOverlap = i;
    }
  }
  
  if (maxOverlap > 0) {
    const keepA = wordsA.slice(0, wordsA.length - maxOverlap).join(' ');
    return keepA ? `${keepA} ${b}` : b;
  }

  // Эвристика: часто Gemini присылает кусок, который перекрывает почти весь старый текст, но с небольшим отличием в середине.
  // Например, prev: "Как тебя зовут" -> next: "А как тебя зовут?"
  // В таких случаях лучше просто вернуть next.
  // Если строка B длинная и содержит большинство слов из A:
  const aCleanWords = wordsA.map((w) => w.toLowerCase().replaceAll(/[.,!?:;()]/g, '')).filter(Boolean);
  const bCleanWords = wordsB.map((w) => w.toLowerCase().replaceAll(/[.,!?:;()]/g, '')).filter(Boolean);
  
  if (aCleanWords.length > 0 && bCleanWords.length >= aCleanWords.length) {
      let commonWords = 0;
      for (const w of aCleanWords) {
          if (bCleanWords.includes(w)) commonWords++;
      }
      // Если 80% слов из A есть в B, и B длиннее или равно, заменяем A на B (считая это коррекцией)
      if (commonWords / aCleanWords.length >= 0.8) {
          return b;
      }
  }

  // Распространенная ситуация с Interim транскрипциями: 
  // prev: "как тебя"
  // next: "как тебя зовут"
  // Это покрывается cleanB.startsWith(cleanA) выше.
  // Но если "Как тебя" и "А как тебя зовут", то это не сработает.
  // Оставляем базовую склейку, если не найдено пересечений.
  return `${a} ${b}`.trim();
};

const bytesToBase64 = (bytes: Uint8Array) => {
  // Быстрая конвертация без O(n²) конкатенации в цикле.
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
};

const isWs = (c: string) => /\s/u.test(c);

const parseScoreDeltaSum = (text: string) => {
  const upper = text.toUpperCase();
  let index = 0;
  let total = 0;

  while (index < upper.length) {
    const found = upper.indexOf('SCORE', index);
    if (found === -1) break;
    let i = found + 5;
    while (i < upper.length && isWs(upper[i])) i += 1;
    if (upper[i] !== ':') {
      index = i;
      continue;
    }
    i += 1;
    while (i < upper.length && isWs(upper[i])) i += 1;

    let sign = 1;
    if (upper[i] === '+' || upper[i] === '-') {
      sign = upper[i] === '-' ? -1 : 1;
      i += 1;
      while (i < upper.length && isWs(upper[i])) i += 1;
    }

    const start = i;
    while (i < upper.length && upper[i] >= '0' && upper[i] <= '9') i += 1;
    if (i > start) {
      const n = Number(upper.slice(start, i));
      if (Number.isFinite(n)) total += sign * n;
    }

    index = i;
  }

  return total;
};

const parseCheckpointIds = (text: string) => {
  const upper = text.toUpperCase();
  let index = 0;
  const ids: string[] = [];

  while (index < upper.length) {
    const found = upper.indexOf('CHECKPOINT', index);
    if (found === -1) break;
    let i = found + 10;
    while (i < upper.length && isWs(upper[i])) i += 1;
    if (upper[i] !== ':') {
      index = i;
      continue;
    }
    i += 1;
    while (i < upper.length && isWs(upper[i])) i += 1;

    const start = i;
    while (i < upper.length) {
      const c = upper[i];
      if ((c >= 'A' && c <= 'Z') || c === '_') {
        i += 1;
      } else {
        break;
      }
    }
    if (i > start) {
      ids.push(upper.slice(start, i));
    }

    index = i;
  }

  return ids;
};

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export interface UseGeminiLiveOptions {
  agentId?: string;
  onCallEnd?: (transcript: TranscriptEntry[]) => void;
  onError?: (message: string) => void;
  speakerName?: string;
  systemInstruction: string;
  voiceName?: string;
}

export function useGeminiLive({
  agentId = 'training-gfd-stress',
  onCallEnd,
  onError,
  systemInstruction,
  voiceName = 'Kore',
  speakerName,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [score, setScore] = useState(0);
  const [patience, setPatience] = useState(PATIENCE_INITIAL);
  const [hangUpByAi, setHangUpByAi] = useState(false);
  const [hangUpReason, setHangUpReason] = useState<HangUpReason>(null);
  const [checkpoints, setCheckpoints] = useState<VoiceCallCheckpoint[]>([]);
  const [uiConfig, setUiConfig] = useState<GeminiLiveUIConfig>({
    assistantLabel: 'ИИ-агент',
    checkpointIds: [],
    contextWindow: DEFAULT_CONTEXT_WINDOW,
    enableCheckpoints: true,
    enableScoring: true,
    goals: [],
    sessionDurationMs: DEFAULT_SILENCE_HARD_HANGUP_MS,
    showIntroDialog: true,
    silenceHardHangupMs: DEFAULT_SILENCE_HARD_HANGUP_MS,
    silenceNudgeAfterMs: DEFAULT_SILENCE_NUDGE_AFTER_MS,
    silenceNudgeCooldownMs: DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
    silenceNudgePhrases: DEFAULT_SILENCE_NUDGE_PHRASES,
    userLabel: 'Вы',
  });

  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const checkpointsRef = useRef<VoiceCallCheckpoint[]>([]);
  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);

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
  const uiConfigRef = useRef<GeminiLiveUIConfig>(uiConfig);
  const lastAgentIdRef = useRef<string>(agentId);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const userVolumeTargetRef = useRef(0);
  const userVolumeCurrentRef = useRef(0);
  const aiVolumeCurrentRef = useRef(0);
  const noiseFloorRef = useRef(0);
  const userGateActiveUntilRef = useRef(0);
  const freqDataRef = useRef<Uint8Array | null>(null);
  const lastBargeInAtRef = useRef(0);
  const bargeInLoudSinceRef = useRef(0);
  const skipEchoCooldownOnceRef = useRef(false);

  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const currentAiTurnTextRef = useRef('');
  const currentAiTurnMetaTextRef = useRef('');
  const lastUserSpeechRef = useRef<number>(0);
  const lastUserAudioActiveAtRef = useRef<number>(0);
  const blockUserTranscriptionUntilRef = useRef<number>(0);
  const lastAiTextForEchoRef = useRef<string>('');
  const ambientRef = useRef<HTMLAudioElement | null>(null);

  const connectionLockRef = useRef(false);
  const isCallActive = status === 'connecting' || status === 'ready';

  const lowVolumeSinceRef = useRef<number>(0);
  const mumbleCooldownRef = useRef<number>(0);
  const lastBotEndRef = useRef<number>(0);
  const monologueTriggeredRef = useRef(false);
  const silenceSinceRef = useRef<number>(0);
  const silenceCooldownRef = useRef<number>(0);
  const silenceNudgeCountRef = useRef(0);
  const disconnectRef = useRef<() => void>(() => {});
  const hangupScheduledRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const autoFinishTriggeredRef = useRef(false);
  const aiSpeakingSinceRef = useRef<number>(0);
  const roundStartRef = useRef<number | null>(null);
  const roundVerdictTriggeredRef = useRef(false);
  const firstAiTurnCompleteRef = useRef(false);
  const speakerNameRef = useRef(speakerName?.trim() || '');
  const deductedSessionRef = useRef(false);

  useEffect(() => {
    speakerNameRef.current = speakerName?.trim() || '';
  }, [speakerName]);

  const cleanupMedia = () => {
    try {
      const ambient = ambientRef.current;
      if (ambient) {
        try {
          ambient.pause();
        } catch {}
        try {
          ambient.currentTime = 0;
        } catch {}
      }
    } catch {}
    ambientRef.current = null;

    try {
      streamerRef.current?.stop();
    } catch {}
    streamerRef.current = null;
    analyserRef.current = null;
    freqDataRef.current = null;

    if (workletNodeRef.current) {
      try {
        try {
          workletNodeRef.current.port.onmessage = null;
        } catch {}
        workletNodeRef.current.disconnect();
      } catch {}
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {}
    }
    workletNodeRef.current = null;

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {}
        });
      } catch {}
      streamRef.current = null;
    }

    try {
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.onerror = null;
        wsRef.current.onmessage = null;
        if (wsRef.current.readyState !== WebSocket.CLOSED) {
          wsRef.current.close();
        }
      }
    } catch {}
    wsRef.current = null;

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {}
      audioContextRef.current = null;
    }
    if (playContextRef.current) {
      try {
        if (playContextRef.current.state !== 'closed') {
          playContextRef.current.close().catch(() => {});
        }
      } catch {}
      playContextRef.current = null;
    }

    sourceRef.current = null;
    isPlayingRef.current = false;
    isSetupCompleteRef.current = false;
    userVolumeTargetRef.current = 0;
    userVolumeCurrentRef.current = 0;
    aiVolumeCurrentRef.current = 0;
    noiseFloorRef.current = 0;
    userGateActiveUntilRef.current = 0;
    connectionLockRef.current = false;
    hangupScheduledRef.current = false;
    autoFinishTriggeredRef.current = false;
    aiSpeakingSinceRef.current = 0;
    deductedSessionRef.current = false;
  };

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

  const finalizeCall = useCallback(
    (reason: Exclude<HangUpReason, null>, message: string, delayMs = 1200, markAsError = true) => {
      if (hangupScheduledRef.current) return;
      hangupScheduledRef.current = true;
      setHangUpReason(reason);
      setHangUpByAi(true);
      if (markAsError) {
        reportError(message);
      } else {
        setErrorMessage(message);
      }
      setTimeout(() => {
        disconnectRef.current();
      }, delayMs);
    },
    [reportError],
  );

  const maybeAutoFinish = useCallback(
    (latestScore: number) => {
      if (
        statusRef.current !== 'ready' ||
        autoFinishTriggeredRef.current ||
        hangupScheduledRef.current
      )
        return;
      if (!uiConfigRef.current.enableCheckpoints || !uiConfigRef.current.enableScoring) return;

      const allDone = checkpointsRef.current.every((item) => item.done);
      const enoughDialogue = transcriptRef.current.length >= 6;
      if (!allDone || !enoughDialogue || latestScore < 12) return;

      autoFinishTriggeredRef.current = true;
      sendClientText(uiConfigRef.current.autoSuccessPrompt ?? DEFAULT_AUTO_SUCCESS_PROMPT);

      setTimeout(() => {
        if (hangupScheduledRef.current || statusRef.current !== 'ready') return;
        finalizeCall('success', 'Интервью завершено: все цели достигнуты.', 1200, false);
      }, 9000);
    },
    [finalizeCall, sendClientText],
  );

  const connect = useCallback(async () => {
    if (connectionLockRef.current) return;
    connectionLockRef.current = true;
    // eslint-disable-next-line no-console
    console.log('[GeminiLive] Starting connect...');

    try {
      const startRes = await fetch('/api/voice-call/start', {
        method: 'POST',
        credentials: 'include',
      });
      if (!startRes.ok) {
        const startPayload = (await startRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(startPayload.error || 'Запуск тренажёра недоступен');
      }

      // Сначала загружаем конфиг (цели, подписи и т.д.), чтобы панель «Цели разговора» отображалась сразу при появлении статуса connecting
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Fetching config...');
      if (!configFetchedRef.current || !configRef.current || lastAgentIdRef.current !== agentId) {
        const speaker = speakerName?.trim();
        const query = new URLSearchParams({ agentId });
        if (speaker) query.set('speakerName', speaker);
        const res = await fetch(`/api/voice-call/config?${query.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Ошибка загрузки конфига: ${res.status}`);
        lastAgentIdRef.current = agentId;
        configRef.current = await res.json();
        configFetchedRef.current = true;
      }
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Config fetched successfully');

      const config = configRef.current as typeof configRef.current & { systemInstruction?: string };
      if (!config?.apiKey) throw new Error('Нет API-ключа Google.');

      const nextUiConfig: GeminiLiveUIConfig = {
        assistantLabel: config.assistantLabel || 'ИИ-агент',
        checkpointIds: Array.isArray(config.checkpointIds) ? config.checkpointIds : [],
        contextWindow: config.contextWindow ?? DEFAULT_CONTEXT_WINDOW,
        enableCheckpoints: config.enableCheckpoints ?? true,
        enableScoring: config.enableScoring ?? true,
        goals: Array.isArray(config.goals) ? config.goals : [],
        introDialogButtonLabel: config.introDialogButtonLabel ?? undefined,
        introDialogDescription: config.introDialogDescription ?? undefined,
        introDialogHint: config.introDialogHint ?? undefined,
        introDialogPlaceholder: config.introDialogPlaceholder ?? undefined,
        introDialogTitle: config.introDialogTitle ?? undefined,
        showIntroDialog: config.showIntroDialog ?? true,
        openingInstruction: config.openingInstruction ?? undefined,
        roundEndingPrompt: config.roundEndingPrompt ?? undefined,
        silenceNudgeTemplate: config.silenceNudgeTemplate ?? undefined,
        shortAnswerNudge: config.shortAnswerNudge ?? undefined,
        quietSpeakerNudge: config.quietSpeakerNudge ?? undefined,
        autoSuccessPrompt: config.autoSuccessPrompt ?? undefined,
        scoreDisplayLabel: config.scoreDisplayLabel ?? undefined,
        scoreLevelLabels: config.scoreLevelLabels ?? undefined,
        sessionDurationMs:
          config.sessionDurationMs ?? config.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
        silenceHardHangupMs: config.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
        silenceNudgeAfterMs: config.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
        silenceNudgeCooldownMs: config.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
        silenceNudgePhrases: config.silenceNudgePhrases?.length
          ? config.silenceNudgePhrases
          : DEFAULT_SILENCE_NUDGE_PHRASES,
        userLabel: config.userLabel || 'Вы',
      };
      uiConfigRef.current = nextUiConfig;
      setUiConfig(nextUiConfig);

      setStatus('connecting');
      setErrorMessage(null);
      isSetupCompleteRef.current = false;
      setScore(0);
      setPatience(PATIENCE_INITIAL);
      setHangUpByAi(false);
      setHangUpReason(null);
      const initialCheckpoints = nextUiConfig.enableCheckpoints
        ? (nextUiConfig.goals?.length ? nextUiConfig.goals : []).map((label, index) => ({
            id: nextUiConfig.checkpointIds?.[index] || `goal-${index}`,
            label: label ?? '',
            done: false,
          }))
        : [];
      setCheckpoints(initialCheckpoints);
      checkpointsRef.current = initialCheckpoints;

      transcriptRef.current = [];

      currentAiTurnTextRef.current = '';
      currentAiTurnMetaTextRef.current = '';
      hangupScheduledRef.current = false;
      autoFinishTriggeredRef.current = false;
      aiSpeakingSinceRef.current = 0;
      silenceNudgeCountRef.current = 0;
      lastUserSpeechRef.current = 0;
      lastUserAudioActiveAtRef.current = 0;
      blockUserTranscriptionUntilRef.current = 0;
      lastAiTextForEchoRef.current = '';
      lastBargeInAtRef.current = 0;
      bargeInLoudSinceRef.current = 0;
      skipEchoCooldownOnceRef.current = false;
      firstAiTurnCompleteRef.current = false;
      deductedSessionRef.current = false;

      // Ensure any previous stream is stopped before requesting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      streamRef.current = stream;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Microphone acquired');

      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!playContextRef.current || playContextRef.current.state === 'closed') {
        playContextRef.current = new Ctx({ sampleRate: PCM_OUT_SAMPLE_RATE });
      }
      const playContext = playContextRef.current;
      if (!streamerRef.current) {
        const streamer = new AudioStreamer(playContext);
        streamer.onPlayStateChange = (playing) => {
          isPlayingRef.current = playing;
          if (!playing) {
            if (skipEchoCooldownOnceRef.current) {
              skipEchoCooldownOnceRef.current = false;
            } else {
              blockUserTranscriptionUntilRef.current = Date.now() + USER_ECHO_COOLDOWN_MS;
            }
          }
        };
        streamerRef.current = streamer;
        analyserRef.current = streamer.analyser;
        freqDataRef.current = new Uint8Array(streamer.analyser.frequencyBinCount);
      }
      if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
        audioContextRef.current = new Ctx({ sampleRate: PCM_IN_SAMPLE_RATE });
      }

      // eslint-disable-next-line no-console
      console.log('[GeminiLive] AudioContexts created/resumed');
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

      const baseUrl = config.geminiWsUrl || GEMINI_LIVE_WS;
      const url = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}`;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Creating WebSocket...', url.slice(0, 100) + '...');
      const ws = new WebSocket(url);
      wsRef.current = ws;

      const flushInterruptedAiTurn = () => {
        const rawTurnText =
          `${currentAiTurnMetaTextRef.current} ${currentAiTurnTextRef.current}`.trim();
        const spokenText = cleanAiText(currentAiTurnTextRef.current.trim());
        const storeText = spokenText || (rawTurnText ? cleanAiText(rawTurnText) : '');
        if (storeText) {
          transcriptRef.current.push({ role: 'ai', text: storeText });
          lastAiTextForEchoRef.current = storeText;
        }
        if (!firstAiTurnCompleteRef.current && (storeText || streamerRef.current?.isPlaying)) {
          firstAiTurnCompleteRef.current = true;
        }
        currentAiTurnTextRef.current = '';
        currentAiTurnMetaTextRef.current = '';
      };

      const appendAiSpokenTranscription = (text: unknown) => {
        const next = typeof text === 'string' ? text.trim() : '';
        if (!next) return;
        if (!firstAiTurnCompleteRef.current) {
          firstAiTurnCompleteRef.current = true;
        }
        currentAiTurnTextRef.current = mergeLiveTranscriptionText(
          currentAiTurnTextRef.current,
          next,
        );
      };

      const upsertUserTranscriptFromGemini = (text: unknown) => {
        const inputText = typeof text === 'string' ? text.trim() : '';
        if (!inputText) return;

        const now = Date.now();
        const userVol = userVolumeCurrentRef.current;
        const hasRecentUserAudio =
          now - lastUserAudioActiveAtRef.current <= USER_AUDIO_ACTIVITY_WINDOW_MS;
        const dynamicThreshold = Math.max(
          USER_AUDIO_ACTIVITY_THRESHOLD,
          noiseFloorRef.current + USER_NOISE_MARGIN,
        );

        // Фильтр «галлюцинаций» ASR при тишине и защиты от подслушанного голоса ИИ.
        // Если ИИ говорит, но пользователь не пытается перебить (громкость ниже порога) — игнорируем inputTranscription.
        // Если ИИ молчит, но микрофон по уровню "в тишине" — тоже игнорируем.
        if (isPlayingRef.current) {
          if (userVol < BARGE_IN_VOLUME_THRESHOLD && !hasRecentUserAudio) return;
        } else {
          if (userVol < dynamicThreshold && !hasRecentUserAudio) return;
        }

        const lastAiText =
          lastAiTextForEchoRef.current ||
          getLastAiText(transcriptRef.current, currentAiTurnTextRef.current);
        const likelyEcho = !!lastAiText && isLikelyEcho(inputText, lastAiText);

        if (likelyEcho && (isPlayingRef.current || now < blockUserTranscriptionUntilRef.current))
          return;

        const lastEntry = transcriptRef.current.at(-1);
        const startNewUtterance =
          lastEntry?.role !== 'user' || now - lastUserSpeechRef.current > USER_UTTERANCE_BREAK_MS;

        if (!startNewUtterance && lastEntry && lastEntry.role === 'user') {
          lastEntry.text = mergeLiveTranscriptionText(lastEntry.text, inputText);
        } else {
          transcriptRef.current.push({ role: 'user', text: inputText });
        }

        lastUserSpeechRef.current = now;
        lastUserAudioActiveAtRef.current = now;
        lastBotEndRef.current = 0;
      };

      const sendStartTrigger = () => {
        const assistantLabel = uiConfigRef.current.assistantLabel || 'собеседника';
        const trimmedName = speakerNameRef.current;
        const nameLine = trimmedName
          ? `Собеседника зовут ${trimmedName}. Обязательно обратись к нему по имени в первой реплике.`
          : 'Обратись к собеседнику вежливо на «вы» в первой реплике.';

        const customOpening = config.openingInstruction?.trim();
        const defaultOpeningText = `Начинай интервью. Представься коротко как ${assistantLabel} и произнеси первую реплику в прямой речи. ${nameLine} Сразу задай первый уточняющий вопрос в формате живого эфира для зрителей.`;
        const startText = customOpening
          ? customOpening
              .replaceAll('{{assistantLabel}}', assistantLabel)
              .replaceAll('{{nameLine}}', nameLine)
              .replaceAll('{{speakerInstruction}}', nameLine)
          : defaultOpeningText;

        if (wsRef.current?.readyState === WebSocket.OPEN) {
          // eslint-disable-next-line no-console
          console.log('[GeminiLive] Sending start trigger...');
          wsRef.current.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  {
                    role: 'user',
                    parts: [{ text: startText }],
                  },
                ],
                turnComplete: true,
              },
            }),
          );
        }
      };

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log('[GeminiLive] WebSocket OPENED! Sending setupMsg...');
        const extraSpeakerLine = speakerNameRef.current
          ? `\n- На вопросы сейчас отвечает сотрудник: ${speakerNameRef.current}. Обращайся к нему по имени.`
          : '';
        const sysInst =
          (config.systemInstruction || systemInstruction || '') +
          (extraSpeakerLine ? `\n\n${extraSpeakerLine}` : '');
        const setupMsg: Record<string, unknown> = {
          setup: {
            model: LIVE_MODEL,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || voiceName } },
              },
            },
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        };
        if (sysInst)
          (setupMsg.setup as Record<string, unknown>).systemInstruction = {
            parts: [{ text: sysInst }],
          };
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
            console.error('[GeminiLive] Error from server:', data.error.message);
            if (isSetupCompleteRef.current && transcriptRef.current.length > 0) {
              finalizeCall('ai', 'Соединение прервано сервером ИИ.', 1500, false);
            } else {
              reportError(data.error.message);
            }
            return;
          }

          if (data.setupComplete) {
            // eslint-disable-next-line no-console
            console.log('[GeminiLive] Received setupComplete! Connection is ready.');
            isSetupCompleteRef.current = true;
            setStatus('ready');
            playConnectionTone();
            roundStartRef.current = Date.now();
            roundVerdictTriggeredRef.current = false;
            sendStartTrigger();
            return;
          }

          // Транскрипции могут приходить отдельными server-сообщениями и не всегда внутри serverContent
          const topLevelOutputText = data.outputTranscription?.text;
          if (topLevelOutputText) appendAiSpokenTranscription(topLevelOutputText);
          const topLevelInputText = data.inputTranscription?.text;
          if (topLevelInputText) upsertUserTranscriptFromGemini(topLevelInputText);

          const serverContent = data.serverContent;
          if (!serverContent) return;

          if (serverContent.interrupted) {
            flushInterruptedAiTurn();
            return;
          }

          const parts = serverContent.modelTurn?.parts ?? serverContent.parts;
          if (parts?.length) {
            for (const part of parts) {
              const audioB64 = part.inlineData?.data ?? part.audio?.data;
              if (audioB64) {
                if (!firstAiTurnCompleteRef.current) {
                  firstAiTurnCompleteRef.current = true;
                }
                streamerRef.current?.addPCM16(audioB64);
              }

              if (part.text) {
                if (!firstAiTurnCompleteRef.current) {
                  firstAiTurnCompleteRef.current = true;
                }
                currentAiTurnMetaTextRef.current += part.text + ' ';
              }
            }
          }

          if (!topLevelOutputText) {
            appendAiSpokenTranscription(serverContent.outputTranscription?.text);
          }

          if (!topLevelInputText) {
            upsertUserTranscriptFromGemini(serverContent.inputTranscription?.text);
          }

          if (serverContent.turnComplete) {
            const rawTurnText =
              `${currentAiTurnMetaTextRef.current} ${currentAiTurnTextRef.current}`.trim();
            const turnText = rawTurnText;
            // eslint-disable-next-line no-console
            console.log('[GeminiLive] turnComplete text:', turnText.slice(0, 200));

            // Парсинг тегов скоринга от LLM после завершения реплики
            if (uiConfigRef.current.enableScoring) {
              const totalDelta = parseScoreDeltaSum(turnText);
              if (totalDelta !== 0) {
                setScore((prev) => {
                  const nextScore = clamp(prev + totalDelta, -50, 50);
                  maybeAutoFinish(nextScore);
                  return nextScore;
                });
              }
            }

            // Парсинг тегов чекпоинтов от LLM после завершения реплики
            const checkpointIds = parseCheckpointIds(turnText);
            if (checkpointIds.length > 0) {
              const ids = new Set(checkpointIds.map((id) => id.toLowerCase()));
              const next = checkpointsRef.current.map((cp) =>
                ids.has(cp.id.toLowerCase()) ? { ...cp, done: true } : cp,
              );
              checkpointsRef.current = next;
              setCheckpoints(next);
            }

            const spokenText = cleanAiText(currentAiTurnTextRef.current.trim());
            const fallbackText = spokenText ? '' : cleanAiText(rawTurnText);
            const storeText = spokenText || fallbackText;

            if (storeText) {
              transcriptRef.current.push({ role: 'ai', text: storeText });
              lastAiTextForEchoRef.current = storeText;
            }
            currentAiTurnTextRef.current = '';
            currentAiTurnMetaTextRef.current = '';
            if (!firstAiTurnCompleteRef.current) {
              firstAiTurnCompleteRef.current = true;
            }
            lastBotEndRef.current = Date.now();
          }
        } catch (e) {
          console.warn('Ошибка парсинга:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[GeminiLive] WebSocket error:', e);
        reportError('Ошибка WebSocket. Проверьте интернет.');
      };
      ws.onclose = (event) => {
        console.warn(
          `[GeminiLive] WebSocket closed with code: ${event.code}, reason: ${event.reason}`,
        );
        wsRef.current = null;
        if (!isSetupCompleteRef.current) {
          connectionLockRef.current = false;
          const reasonStr = String(event.reason || '');
          const reasonLower = reasonStr.toLowerCase();
          const isLocationBlock =
            event.code === 1007 && /location|not supported|region|country|geo/i.test(reasonLower);
          const isProdHost =
            typeof window !== 'undefined' &&
            !/^(?:localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
          if (isLocationBlock && isProdHost) {
            reportError(
              'Google Live API недоступен из браузера в этом регионе (прямое подключение). На продакшене задайте в Vercel переменную VOICE_CALL_WS_PROXY_URL=wss://ваш-хост-прокси/ и запустите scripts/voice-call-ws-proxy.mts на отдельном сервере (VPS, Railway, Fly.io) с HTTPS_PROXY до Google. Логи Vercel не показывают WebSocket браузера — соединение идёт с устройства пользователя.',
            );
          } else {
            reportError(
              `Live-соединение закрыто до старта (code: ${event.code}${reasonStr ? `: ${reasonStr}` : ''}). Проверьте VPN/прокси или настройку VOICE_CALL_WS_PROXY_URL на продакшене.`,
            );
          }
          return;
        }

        if (!hangupScheduledRef.current && transcriptRef.current.length > 0) {
          finalizeCall('ai', 'Соединение закрыто.', 1000, false);
        } else if (!hangupScheduledRef.current) {
          setStatus('idle');
        }
      };

      const audioContext = audioContextRef.current!;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Adding audio worklet module...');
      await audioContext.audioWorklet.addModule('/worklets/audio-processor.js');
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Audio worklet module added.');
      const workletNode = new AudioWorkletNode(audioContext, 'audio-processor');
      workletNodeRef.current = workletNode;

      workletNode.port.onmessage = (
        event: MessageEvent<{ buffer: ArrayBuffer; volume: number }>,
      ) => {
        const { buffer, volume } = event.data;
        const now = Date.now();
        const scaledVolume = Math.min(100, volume * USER_VOLUME_SCALE);
        userVolumeTargetRef.current = scaledVolume;

        if (!isPlayingRef.current) {
          const floor = noiseFloorRef.current;
          if (floor === 0) {
            noiseFloorRef.current = scaledVolume;
          } else if (scaledVolume < floor) {
            noiseFloorRef.current = floor + (scaledVolume - floor) * NOISE_FLOOR_FALL_ALPHA;
          } else {
            noiseFloorRef.current = floor + (scaledVolume - floor) * NOISE_FLOOR_RISE_ALPHA;
          }
        }

        const dynamicThreshold = Math.max(
          USER_AUDIO_ACTIVITY_THRESHOLD,
          noiseFloorRef.current + USER_NOISE_MARGIN,
        );

        const isAiSpeakingNow = isPlayingRef.current;
        if (isAiSpeakingNow) {
          if (scaledVolume >= BARGE_IN_VOLUME_THRESHOLD) {
            // Пользователь пытается говорить поверх ИИ — фиксируем «аудио-активность»,
            // чтобы входящие inputTranscription не считались галлюцинацией при речи ИИ.
            if (firstAiTurnCompleteRef.current) {
              lastUserAudioActiveAtRef.current = now;
            }
            if (bargeInLoudSinceRef.current === 0) bargeInLoudSinceRef.current = now;

            const loudFor = now - bargeInLoudSinceRef.current;
            const canBargeIn = now - lastBargeInAtRef.current >= BARGE_IN_COOLDOWN_MS;
            if (loudFor >= BARGE_IN_SUSTAIN_MS && canBargeIn) {
              lastBargeInAtRef.current = now;
              bargeInLoudSinceRef.current = 0;
              lastUserAudioActiveAtRef.current = now;
              blockUserTranscriptionUntilRef.current = 0;
              skipEchoCooldownOnceRef.current = true;
              flushInterruptedAiTurn();
              streamerRef.current?.stop();
            }
          } else {
            bargeInLoudSinceRef.current = 0;
          }
        } else {
          bargeInLoudSinceRef.current = 0;
          // Маркер «пользователь реально говорит»: используем как фильтр от ASR-галлюцинаций при тишине.
          if (scaledVolume >= dynamicThreshold) {
            lastUserAudioActiveAtRef.current = now;
            userGateActiveUntilRef.current = now + USER_AUDIO_GATE_HOLD_MS;
          }
        }

        const wsState = wsRef.current;
        if (!wsState || wsState.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current)
          return;
        // Пока ИИ не закончил первую реплику, не отправляем аудио с микрофона,
        // чтобы избежать реакции на фон/шум в начале разговора.
        if (!firstAiTurnCompleteRef.current) return;

        // Во время речи ИИ отправляем звук только если пользователь действительно пытается перебить (громкость выше порога).
        // Это даёт barge-in (ИИ прекращает речь и начинает слушать), но не шлёт постоянный шум/эхо при монологе.
        if (isPlayingRef.current && scaledVolume < BARGE_IN_VOLUME_THRESHOLD) return;

        if (
          !isPlayingRef.current &&
          scaledVolume < dynamicThreshold &&
          now > userGateActiveUntilRef.current
        )
          return;

        const bytes = new Uint8Array(buffer);
        const dataB64 = bytesToBase64(bytes);
        wsState.send(
          JSON.stringify({
            realtimeInput: {
              mediaChunks: [{ mimeType: 'audio/pcm;rate=16000', data: dataB64 }],
            },
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
    finalizeCall,
    maybeAutoFinish,
  ]);

  const disconnect = useCallback(() => {
    // Захватываем незаконченную реплику ИИ, если она есть
    const rawPendingAiText =
      `${currentAiTurnMetaTextRef.current} ${currentAiTurnTextRef.current}`.trim();
    const pendingSpokenText = cleanAiText(currentAiTurnTextRef.current.trim());
    const pendingAiText =
      pendingSpokenText || (rawPendingAiText ? cleanAiText(rawPendingAiText) : '');
    if (pendingAiText) transcriptRef.current.push({ role: 'ai', text: pendingAiText });
    currentAiTurnTextRef.current = '';
    currentAiTurnMetaTextRef.current = '';

    const transcript = [...transcriptRef.current];
    onCallEnd?.(transcript);

    transcriptRef.current = [];
    lastUserAudioActiveAtRef.current = 0;
    blockUserTranscriptionUntilRef.current = 0;
    lastAiTextForEchoRef.current = '';
    lastBargeInAtRef.current = 0;
    bargeInLoudSinceRef.current = 0;
    skipEchoCooldownOnceRef.current = false;

    try {
      const ambient = ambientRef.current;
      if (ambient) {
        ambient.pause();
        try {
          ambient.currentTime = 0;
        } catch {}
      }
    } catch {}

    playDisconnectTone();

    cleanupMedia();

    setStatus('idle');
    setErrorMessage(null);
    setUserVolume(0);
    setAiVolume(0);
    setScore(0);
    setPatience(PATIENCE_INITIAL);
    const goals = uiConfigRef.current.goals ?? [];
    const cpIds = uiConfigRef.current.checkpointIds ?? [];
    const resetCheckpoints = goals.map((label, index) => ({
      id: cpIds[index] || `goal-${index}`,
      label,
      done: false,
    }));
    const nextCheckpoints = uiConfigRef.current.enableCheckpoints ? resetCheckpoints : [];
    setCheckpoints(nextCheckpoints);
    checkpointsRef.current = nextCheckpoints;
    setHangUpReason(null);
  }, [playDisconnectTone, onCallEnd]);

  const clearError = useCallback(() => {
    connectionLockRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);
  useEffect(() => {
    if (status === 'connecting' || status === 'ready') return;
    const ambient = ambientRef.current;
    if (!ambient) return;
    try {
      ambient.pause();
      ambient.currentTime = 0;
    } catch {}
  }, [status]);

  useEffect(
    () => () => {
      cleanupMedia();
    },
    [],
  );

  useEffect(() => {
    if (status !== 'ready') return;

    const id = setInterval(() => {
      const vol = userVolumeCurrentRef.current;
      const now = Date.now();
      const silenceAfterMs = uiConfigRef.current.silenceNudgeAfterMs;
      const silenceCooldownMs = uiConfigRef.current.silenceNudgeCooldownMs;
      const silenceHardHangupMs = uiConfigRef.current.silenceHardHangupMs;
      const silencePhrases = uiConfigRef.current.silenceNudgePhrases;

      // Логика списания сессии: если прошла 1 минута, списываем
      if (roundStartRef.current && !deductedSessionRef.current) {
        const elapsed = now - roundStartRef.current;
        if (elapsed >= 60_000) {
          deductedSessionRef.current = true;
          fetch('/api/voice-call/deduct', { method: 'POST', credentials: 'include' })
            .then((res) => {
              if (res.ok) {
                useUserStore.getState().refreshUserState();
              }
            })
            .catch((e) => console.error('Failed to deduct session', e));
        }
      }

      // Логика раунда по времени: за 15 секунд до конца просим ИИ подвести итоги,
      // по истечении времени — завершаем интервью.
      if (silenceHardHangupMs && roundStartRef.current) {
        const elapsed = now - roundStartRef.current;
        const remaining = silenceHardHangupMs - elapsed;

        if (!roundVerdictTriggeredRef.current && remaining <= 15_000 && remaining > 0) {
          roundVerdictTriggeredRef.current = true;
          sendClientText(uiConfigRef.current.roundEndingPrompt ?? DEFAULT_ROUND_ENDING_PROMPT);
        }

        if (remaining <= 0 && !hangupScheduledRef.current) {
          finalizeCall('success', 'Время интервью истекло. Эфир завершён.', 1200, false);
          return;
        }
      }

      // Короткий «буфер» после завершения речи ИИ: не считаем шум/эхо голосом пользователя.
      if (!isPlayingRef.current && now < blockUserTranscriptionUntilRef.current) {
        lowVolumeSinceRef.current = 0;
        if (silenceSinceRef.current === 0) silenceSinceRef.current = now;
        return;
      }

      if (isPlayingRef.current) {
        if (aiVolumeCurrentRef.current >= MONOLOGUE_VOLUME_THRESHOLD) {
          if (aiSpeakingSinceRef.current === 0) aiSpeakingSinceRef.current = now;

          const monologueDuration = now - aiSpeakingSinceRef.current;
          if (monologueDuration >= MONOLOGUE_DURATION_MS && !monologueTriggeredRef.current) {
            monologueTriggeredRef.current = true;
            streamerRef.current?.stop();
            sendClientText(uiConfigRef.current.shortAnswerNudge ?? DEFAULT_SHORT_ANSWER_NUDGE);
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
        }

        const lastBotEnd = lastBotEndRef.current;
        const userSpokeAfterBot = lastUserSpeechRef.current > lastBotEnd;
        const roundStart = roundStartRef.current;

        // Подсказка при паузе после того, как бот уже говорил: «собеседник молчит, скажи …»
        if (
          lastBotEnd > 0 &&
          !userSpokeAfterBot &&
          now - lastBotEnd >= silenceAfterMs &&
          now >= silenceCooldownRef.current
        ) {
          const phrase =
            silencePhrases[Math.floor(Math.random() * silencePhrases.length)] ||
            DEFAULT_SILENCE_NUDGE_PHRASES[0];
          const template =
            uiConfigRef.current.silenceNudgeTemplate ?? DEFAULT_SILENCE_NUDGE_TEMPLATE;
          sendClientText(template.replaceAll('{{phrase}}', phrase));
          silenceCooldownRef.current = now + silenceCooldownMs;
          silenceNudgeCountRef.current += 1;
        } else if (
          // Начальная тишина: ИИ ещё не сказал первую реплику — через N секунд отправить подсказку, чтобы он заговорил.
          !firstAiTurnCompleteRef.current &&
          roundStart != null &&
          now - roundStart >= silenceAfterMs &&
          now >= silenceCooldownRef.current
        ) {
          const phrase =
            silencePhrases[Math.floor(Math.random() * silencePhrases.length)] ||
            DEFAULT_SILENCE_NUDGE_PHRASES[0];
          const template =
            uiConfigRef.current.silenceNudgeTemplate ?? DEFAULT_SILENCE_NUDGE_TEMPLATE;
          sendClientText(template.replaceAll('{{phrase}}', phrase));
          silenceCooldownRef.current = now + silenceCooldownMs;
          silenceNudgeCountRef.current += 1;
        }
      } else if (vol >= 3 && vol < MUMBLE_VOLUME_THRESHOLD) {
        silenceSinceRef.current = 0;
        lastUserSpeechRef.current = now;
        lastBotEndRef.current = 0;
        if (lowVolumeSinceRef.current === 0) {
          lowVolumeSinceRef.current = now;
        } else if (
          now - lowVolumeSinceRef.current >= MUMBLE_DURATION_MS &&
          now >= mumbleCooldownRef.current
        ) {
          sendClientText(uiConfigRef.current.quietSpeakerNudge ?? DEFAULT_QUIET_SPEAKER_NUDGE);
          mumbleCooldownRef.current = now + MUMBLE_COOLDOWN_MS;
          lowVolumeSinceRef.current = 0;
        }
      } else {
        lowVolumeSinceRef.current = 0;
        silenceSinceRef.current = 0;
        lastUserSpeechRef.current = now;
        lastBotEndRef.current = 0;
      }
    }, 1000);

    return () => clearInterval(id);
  }, [status, sendClientText, finalizeCall]);

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

  // Browser SpeechRecognition отключён: текст пользователя берём только из Gemini Live (inputAudioTranscription),
  // чтобы избежать дублей/обрывков и «кривых» записей.

  const getTranscript = useCallback((limit?: number) => {
    const items = [...transcriptRef.current];
    if (limit && items.length > limit) return items.slice(-limit);
    return items;
  }, []);

  return {
    clearError,
    connect,
    disconnect,
    errorMessage,
    hangUpByAi,
    hangUpReason,
    status,
    isCallActive,
    userVolume,
    aiVolume,
    score,
    patience,
    checkpoints,
    getTranscript,
    analyserRef,
    uiConfig,
  };
}

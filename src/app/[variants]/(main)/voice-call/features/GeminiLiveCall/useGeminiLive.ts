'use client';

import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_TRAINING_ROUND_ENDING_PROMPT,
  DEFAULT_VOICE_CALL_AGENT_ID,
  DEFAULT_VOICE_CALL_LIVE_MODEL,
  GEMINI_31_FLASH_LIVE_MODEL,
  GFD_GOOGLE_LIVE_VOICE_AGENT_ID,
} from '@/const/voiceCall';
import { useUserStore } from '@/store/user';
import { type VoiceCallDebugEvent, type VoiceCallDebugSnapshot } from '@/utils/voiceCallDebug';
import { cleanVoiceAiText } from '@/utils/voiceCallSystemText';
import {
  applyTrainingProgress,
  DEFAULT_TRAINING_PROGRESS_TOOL_NAME,
  normalizeTrainingProgressArgs,
} from '@/utils/voiceCallTraining';

import { AudioStreamer } from './AudioStreamer';

const GEMINI_LIVE_WS =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent';
const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;

const USER_VOLUME_SCALE = 500;
const AI_VOLUME_SCALE = 0.15;
const VOLUME_SMOOTH = 0.25;
const VOLUME_DECAY = 0.85;
const USER_AUDIO_ACTIVITY_THRESHOLD = 1.5;
const HEALTH_LOG_INTERVAL_MS = 5000;
const MAX_DEBUG_EVENTS = 200;
const _MAX_SESSION_RESUME_ATTEMPTS = 3;
const DEFAULT_TURN_PLANNER_TOOL_NAME = 'get_training_turn_context';

const resolveVoiceCallLiveModel = (agentId: string) => {
  if (agentId === GFD_GOOGLE_LIVE_VOICE_AGENT_ID) return GEMINI_31_FLASH_LIVE_MODEL;

  return DEFAULT_VOICE_CALL_LIVE_MODEL;
};

export interface GeminiLiveConfig {
  apiKey?: string;
  assistantLabel?: string;
  autoSuccessPrompt?: string | null;
  /** ID чекпоинтов сценария для tool-based отчёта о прогрессе */
  checkpointIds?: string[];
  contextWindow?: number;
  enableCheckpoints?: boolean;
  enableScoring?: boolean;
  enableTurnPlanner?: boolean;
  /** URL WebSocket-прокси (когда задан VOICE_CALL_WS_PROXY_URL), иначе клиент подключается к Google напрямую */
  geminiWsUrl?: string | null;
  /** Массив целей сценария из редактора (используем как чекпоинты в UI) */
  goals?: string[];
  introDialogButtonLabel?: string | null;
  introDialogDescription?: string | null;
  introDialogHint?: string | null;
  introDialogPlaceholder?: string | null;
  introDialogTitle?: string | null;
  liveAuthTokenUrl?: string | null;
  liveModel?: string | null;
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
  trainingProgressToolName?: string | null;
  turnPlannerToolName?: string | null;
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
  /** ID чекпоинтов сценария */
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

interface TrainingTurnPlannerState {
  currentTopic: string | null;
  evidenceUsed: string[];
  lastKnowledgeIds: string[];
  lastUserClaim: string | null;
  openLoops: string[];
  pressureLevel: number;
}

interface TrainingTurnPlan {
  currentTopic: string | null;
  lastUserClaim: string | null;
  openLoops: string[];
  pressureLevel: number;
  reasoning: {
    factualStrength: 'high' | 'low' | 'medium';
    responseGap: 'answered' | 'evasive' | 'partial';
    userTone: 'aggressive' | 'neutral' | 'uncertain';
    weaknessCode:
      | 'direct_answer_missing'
      | 'emotional_defense'
      | 'follow_up_open'
      | 'no_evidence'
      | 'partial_answer';
  };
  relevantKnowledge: Array<{
    attackMyth: string;
    id: string;
    officialUsp: string;
    productIngredient: string;
  }>;
  relevantKnowledgeIds: string[];
  responseMode:
    | 'acknowledge_then_pressure'
    | 'answer_then_probe'
    | 'deescalate_then_return'
    | 'press_for_direct_answer';
  state: TrainingTurnPlannerState;
}

interface PlannerToolCall {
  args?: Record<string, unknown>;
  id?: string;
  name?: string;
}

const PATIENCE_INITIAL = 100;
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 0;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 0;
// По умолчанию раунд длится 5 минут
const DEFAULT_SILENCE_HARD_HANGUP_MS = 300_000;
const DEFAULT_SILENCE_NUDGE_PHRASES: string[] = [];
const FINAL_AI_RESPONSE_ABSOLUTE_MAX_MS = 120_000;
const FINAL_AUDIO_TAIL_MS = 400;
const _MONOLOGUE_DURATION_MS = 15_000;
const _MONOLOGUE_VOLUME_THRESHOLD = 10;

const buildRoundEndingPrompt = (rawPrompt: string) =>
  `${rawPrompt.trim()}\n\nВажно: если ты сейчас произносишь предыдущую реплику, ПРЕРВИСЬ и сразу начни финальную фразу. Скажи итог одним связным ответом и после этого замолчи.`;

/** Очищает служебные теги в тексте от модели */
const cleanAiText = cleanVoiceAiText;

export interface TranscriptEntry {
  role: 'ai' | 'user';
  text: string;
}

export interface GeminiLiveCallEndPayload {
  transcript: TranscriptEntry[];
  userAudioBlob: Blob | null;
}

export type HangUpReason = 'abuse' | 'silence' | 'ai' | 'success' | null;

export interface VoiceCallCheckpoint {
  done: boolean;
  id: 'STRESS_CONTROL' | 'FACT_CHECK' | 'REPUTATION_SAVE' | string;
  label: string;
}

const USER_UTTERANCE_BREAK_MS = 2500;

const log = debug('lobe-client:voice-call:live');
const audioLog = debug('lobe-client:voice-call:audio');

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
    const suffixA = wordsA
      .slice(-i)
      .join(' ')
      .toLowerCase()
      .replaceAll(/[.,!?:;()]/g, '');
    const prefixB = wordsB
      .slice(0, i)
      .join(' ')
      .toLowerCase()
      .replaceAll(/[.,!?:;()]/g, '');

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
  const aCleanWords = wordsA
    .map((w) => w.toLowerCase().replaceAll(/[.,!?:;()]/g, ''))
    .filter(Boolean);
  const bCleanWords = wordsB
    .map((w) => w.toLowerCase().replaceAll(/[.,!?:;()]/g, ''))
    .filter(Boolean);

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

const buildWavBlobFromPcmChunks = (chunks: Uint8Array[], sampleRate: number) => {
  if (chunks.length === 0) return null;

  const pcmLength = chunks.reduce((total, chunk) => total + chunk.byteLength, 0);
  if (pcmLength === 0) return null;

  const wavBuffer = new ArrayBuffer(44 + pcmLength);
  const view = new DataView(wavBuffer);
  const bytes = new Uint8Array(wavBuffer);

  let offset = 0;
  const writeAscii = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset + index, value.charCodeAt(index));
    }
    offset += value.length;
  };

  writeAscii('RIFF');
  view.setUint32(offset, 36 + pcmLength, true);
  offset += 4;
  writeAscii('WAVE');
  writeAscii('fmt ');
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint32(offset, sampleRate, true);
  offset += 4;
  view.setUint32(offset, sampleRate * 2, true);
  offset += 4;
  view.setUint16(offset, 2, true);
  offset += 2;
  view.setUint16(offset, 16, true);
  offset += 2;
  writeAscii('data');
  view.setUint32(offset, pcmLength, true);
  offset += 4;

  let cursor = offset;
  for (const chunk of chunks) {
    bytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return new Blob([wavBuffer], { type: 'audio/wav' });
};

export interface UseGeminiLiveOptions {
  agentId?: string;
  interviewDurationMs?: number;
  onCallEnd?: (payload: GeminiLiveCallEndPayload) => void | Promise<void>;
  onError?: (message: string) => void;
  speakerName?: string;
  systemInstruction: string;
  voiceName?: string;
}

export function useGeminiLive({
  agentId = DEFAULT_VOICE_CALL_AGENT_ID,
  interviewDurationMs,
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

  const debugEventsRef = useRef<VoiceCallDebugEvent[]>([]);
  const statusRef = useRef(status);
  const scoreRef = useRef(score);
  const syncDebugSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;

    window.__voiceCallDebug = {
      agentId,
      events: [...debugEventsRef.current],
      status: statusRef.current,
    };
  }, [agentId]);

  useEffect(() => {
    statusRef.current = status;
    syncDebugSnapshot();
  }, [status, syncDebugSnapshot]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

  const checkpointsRef = useRef<VoiceCallCheckpoint[]>([]);
  useEffect(() => {
    checkpointsRef.current = checkpoints;
  }, [checkpoints]);

  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordedUserPcmChunksRef = useRef<Uint8Array[]>([]);
  const recordedUserPcmBytesRef = useRef(0);
  const audioContextRef = useRef<AudioContext | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const isPlayingRef = useRef(false);
  const configFetchedRef = useRef(false);
  const configRef = useRef<GeminiLiveConfig | null>(null);
  const liveModelFallbackAttemptedRef = useRef<string | null>(null);
  const uiConfigRef = useRef<GeminiLiveUIConfig>(uiConfig);
  const plannerStateRef = useRef<TrainingTurnPlannerState | null>(null);
  const lastAgentIdRef = useRef<string>(agentId);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const userVolumeTargetRef = useRef(0);
  const userVolumeCurrentRef = useRef(0);
  const aiVolumeCurrentRef = useRef(0);
  const freqDataRef = useRef<Uint8Array | null>(null);

  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const currentAiTurnTextRef = useRef('');
  const currentAiTurnMetaTextRef = useRef('');
  const lastUserSpeechRef = useRef<number>(0);
  const lastUserAudioActiveAtRef = useRef<number>(0);
  const lastInputTranscriptionAtRef = useRef<number>(0);
  const lastOutputTranscriptionAtRef = useRef<number>(0);
  const lastServerMessageAtRef = useRef<number>(0);
  const lastWorkletMessageAtRef = useRef<number>(0);
  const lastAudioChunkSentAtRef = useRef<number>(0);
  const lastAudioStreamEndAtRef = useRef<number>(0);
  const audioChunkSentCountRef = useRef(0);
  const audioStreamEndedRef = useRef(false);
  const lastHealthLogAtRef = useRef(0);

  const connectionLockRef = useRef(false);
  const isCallActive = status === 'connecting' || status === 'ready';

  const lastBotEndRef = useRef<number>(0);
  const _monologueTriggeredRef = useRef(false);
  const _silenceCooldownRef = useRef<number>(0);
  const silenceNudgeCountRef = useRef(0);
  const disconnectRef = useRef<() => void>(() => {});
  const hangupScheduledRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const autoFinishTriggeredRef = useRef(false);
  const aiSpeakingSinceRef = useRef<number>(0);
  const roundStartRef = useRef<number | null>(null);
  const roundVerdictTriggeredRef = useRef(false);
  const awaitingFinalAiTurnRef = useRef(false);
  const finalPromptSentAtRef = useRef<number | null>(null);
  const firstAiTurnCompleteRef = useRef(false);
  const speakerNameRef = useRef(speakerName?.trim() || '');
  const deductedSessionRef = useRef(false);
  const sessionResumeHandleRef = useRef<string | null>(null);
  const sessionResumeAttemptsRef = useRef(0);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    speakerNameRef.current = speakerName?.trim() || '';
  }, [speakerName]);

  const pushDebugEvent = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      const event: VoiceCallDebugEvent = {
        at: new Date().toISOString(),
        data,
        type,
      };

      debugEventsRef.current = [...debugEventsRef.current.slice(-(MAX_DEBUG_EVENTS - 1)), event];
      syncDebugSnapshot();
      log('%s %O', type, data ?? {});
    },
    [syncDebugSnapshot],
  );

  const cleanupMedia = () => {
    try {
      streamerRef.current?.stop();
    } catch {
      // ignore cleanup errors
    }
    streamerRef.current = null;
    analyserRef.current = null;
    freqDataRef.current = null;

    if (workletNodeRef.current) {
      try {
        try {
          workletNodeRef.current.port.onmessage = null;
        } catch {
          // ignore cleanup errors
        }
        workletNodeRef.current.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }
    if (sourceRef.current) {
      try {
        sourceRef.current.disconnect();
      } catch {
        // ignore cleanup errors
      }
    }
    workletNodeRef.current = null;

    if (streamRef.current) {
      try {
        streamRef.current.getTracks().forEach((t) => {
          try {
            t.stop();
          } catch {
            // ignore track stop errors
          }
        });
      } catch {
        // ignore cleanup errors
      }
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
    } catch {
      // ignore cleanup errors
    }
    wsRef.current = null;

    if (audioContextRef.current) {
      try {
        if (audioContextRef.current.state !== 'closed') {
          audioContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore cleanup errors
      }
      audioContextRef.current = null;
    }
    if (playContextRef.current) {
      try {
        if (playContextRef.current.state !== 'closed') {
          playContextRef.current.close().catch(() => {});
        }
      } catch {
        // ignore cleanup errors
      }
      playContextRef.current = null;
    }

    sourceRef.current = null;
    isPlayingRef.current = false;
    isSetupCompleteRef.current = false;
    userVolumeTargetRef.current = 0;
    userVolumeCurrentRef.current = 0;
    aiVolumeCurrentRef.current = 0;
    connectionLockRef.current = false;
    hangupScheduledRef.current = false;
    autoFinishTriggeredRef.current = false;
    aiSpeakingSinceRef.current = 0;
    deductedSessionRef.current = false;
    lastInputTranscriptionAtRef.current = 0;
    lastOutputTranscriptionAtRef.current = 0;
    lastServerMessageAtRef.current = 0;
    lastWorkletMessageAtRef.current = 0;
    lastAudioChunkSentAtRef.current = 0;
    lastAudioStreamEndAtRef.current = 0;
    audioChunkSentCountRef.current = 0;
    audioStreamEndedRef.current = false;
    recordedUserPcmChunksRef.current = [];
    recordedUserPcmBytesRef.current = 0;
    lastHealthLogAtRef.current = 0;
    sessionResumeHandleRef.current = null;
    sessionResumeAttemptsRef.current = 0;
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
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

  const requestTurnPlan = useCallback(async (): Promise<TrainingTurnPlan | null> => {
    const transcript = transcriptRef.current.filter((entry) => entry.text.trim().length > 0);

    if (transcript.length === 0) return null;

    try {
      const response = await fetch('/api/voice-call/plan-turn', {
        body: JSON.stringify({
          agentId,
          previousState: plannerStateRef.current,
          transcript,
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };

        throw new Error(payload.error || `Planner request failed: ${response.status}`);
      }

      const plan = (await response.json()) as TrainingTurnPlan;
      plannerStateRef.current = plan.state;
      pushDebugEvent('turn-plan', {
        currentTopic: plan.currentTopic,
        pressureLevel: plan.pressureLevel,
        relevantKnowledgeIds: plan.relevantKnowledgeIds,
        responseMode: plan.responseMode,
      });

      return plan;
    } catch (error) {
      console.error('[GeminiLive] turn planner failed:', error);
      pushDebugEvent('turn-plan-error', {
        message: error instanceof Error ? error.message : 'unknown planner error',
      });

      return null;
    }
  }, [agentId, pushDebugEvent]);

  const sendToolResponses = useCallback((responses: Array<Record<string, unknown>>) => {
    const ws = wsRef.current;

    if (!ws || ws.readyState !== WebSocket.OPEN || responses.length === 0) return;

    ws.send(
      JSON.stringify({
        toolResponse: {
          functionResponses: responses,
        },
      }),
    );
  }, []);

  const sendClientText = useCallback(
    (text: string) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;
      pushDebugEvent('client-text', { text: text.slice(0, 200) });
      ws.send(
        JSON.stringify({
          realtimeInput: { text },
        }),
      );
    },
    [pushDebugEvent],
  );

  const finalizeCall = useCallback(
    (reason: Exclude<HangUpReason, null>, message: string, delayMs = 1200, markAsError = true) => {
      if (hangupScheduledRef.current) return;
      hangupScheduledRef.current = true;
      pushDebugEvent('finalize-call', { delayMs, markAsError, message, reason });
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
    [pushDebugEvent, reportError],
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
      const autoSuccessPrompt = uiConfigRef.current.autoSuccessPrompt;
      if (autoSuccessPrompt) sendClientText(autoSuccessPrompt);

      setTimeout(() => {
        if (
          hangupScheduledRef.current ||
          statusRef.current !== 'ready' ||
          awaitingFinalAiTurnRef.current
        )
          return;
        finalizeCall('success', 'Интервью завершено: все цели достигнуты.', 1200, false);
      }, 9000);
    },
    [finalizeCall, sendClientText],
  );

  const applyTrainingProgressReport = useCallback(
    (args: unknown) => {
      const report = normalizeTrainingProgressArgs(
        args,
        checkpointsRef.current.map((checkpoint) => checkpoint.id),
      );
      const progress = applyTrainingProgress({
        checkpoints: checkpointsRef.current,
        enableCheckpoints: uiConfigRef.current.enableCheckpoints,
        enableScoring: uiConfigRef.current.enableScoring,
        report,
        score: scoreRef.current,
      });

      if (uiConfigRef.current.enableScoring && progress.scoreChanged) {
        scoreRef.current = progress.nextScore;
        setScore(progress.nextScore);
        maybeAutoFinish(progress.nextScore);
      }

      if (
        uiConfigRef.current.enableCheckpoints &&
        progress.nextCheckpoints !== checkpointsRef.current
      ) {
        checkpointsRef.current = progress.nextCheckpoints;
        setCheckpoints(progress.nextCheckpoints);
      }

      pushDebugEvent('training-progress', {
        checkpointIds: report.checkpointIds,
        notes: report.notes,
        scoreDelta: report.scoreDelta ?? null,
        scoreTotal: progress.nextScore,
      });

      return progress;
    },
    [maybeAutoFinish, pushDebugEvent],
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
        if (interviewDurationMs && Number.isFinite(interviewDurationMs)) {
          query.set('durationMs', String(interviewDurationMs));
        }
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

      const rawModel = config.liveModel?.trim() || resolveVoiceCallLiveModel(agentId);
      const liveModel = rawModel.startsWith('models/') ? rawModel : `models/${rawModel}`;

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
        roundEndingPrompt: config.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT,
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
      plannerStateRef.current = null;

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
      lastInputTranscriptionAtRef.current = 0;
      lastOutputTranscriptionAtRef.current = 0;
      lastServerMessageAtRef.current = 0;
      lastWorkletMessageAtRef.current = 0;
      lastAudioChunkSentAtRef.current = 0;
      lastAudioStreamEndAtRef.current = 0;
      audioChunkSentCountRef.current = 0;
      audioStreamEndedRef.current = false;
      lastHealthLogAtRef.current = 0;
      firstAiTurnCompleteRef.current = false;
      deductedSessionRef.current = false;
      debugEventsRef.current = [];
      syncDebugSnapshot();
      pushDebugEvent('connect-start', { agentId });
      pushDebugEvent('live-model-selected', { liveModel });
      recordedUserPcmChunksRef.current = [];
      recordedUserPcmBytesRef.current = 0;
      pushDebugEvent('recording-started', {
        format: 'wav',
        mimeType: 'audio/wav',
        sampleRate: PCM_IN_SAMPLE_RATE,
      });

      // Ensure any previous stream is stopped before requesting a new one
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Requesting microphone...');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      // eslint-disable-next-line no-console
      console.log('[GeminiLive] Microphone acquired');
      const [track] = stream.getAudioTracks();
      if (track) {
        pushDebugEvent('microphone-acquired', {
          constraints: 'browser-default',
          settings: track.getSettings(),
        });
        track.onended = () => pushDebugEvent('microphone-track-ended');
        track.onmute = () => pushDebugEvent('microphone-track-muted');
        track.onunmute = () => pushDebugEvent('microphone-track-unmuted');
      }

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
          pushDebugEvent('playback-state', { playing });
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
      pushDebugEvent('ambient-audio-disabled');

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
        lastOutputTranscriptionAtRef.current = Date.now();
        if (!firstAiTurnCompleteRef.current) {
          firstAiTurnCompleteRef.current = true;
        }
        currentAiTurnTextRef.current = mergeLiveTranscriptionText(
          currentAiTurnTextRef.current,
          next,
        );
        pushDebugEvent('ai-output-transcription', { text: next.slice(0, 160) });
      };

      const upsertUserTranscriptFromGemini = (text: unknown) => {
        const inputText = typeof text === 'string' ? text.trim() : '';
        if (!inputText) return;

        const now = Date.now();
        lastInputTranscriptionAtRef.current = now;

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
        pushDebugEvent('user-input-transcription', {
          isPlaying: isPlayingRef.current,
          text: inputText.slice(0, 160),
        });
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
          pushDebugEvent('start-trigger', { text: startText.slice(0, 200) });
          wsRef.current.send(
            JSON.stringify({
              realtimeInput: {
                text: startText,
              },
            }),
          );
        }
      };

      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log('[GeminiLive] WebSocket OPENED! Sending setupMsg...');
        pushDebugEvent('ws-open');
        const extraSpeakerLine = speakerNameRef.current
          ? `\n- На вопросы сейчас отвечает сотрудник: ${speakerNameRef.current}. Обращайся к нему по имени.`
          : '';
        const russianSpeechStyle = [
          '',
          '[РЕЧЬ И ЖИВОСТЬ]',
          '- Говори на чистом русском языке — как носитель, без акцента. Правильные ударения, живая интонация.',
          '- Англоязычные бренды и аббревиатуры произноси по-русски: GFD → «Джи-Эф-Ди», Zero → «Зеро».',
          '- Каждая реплика — живая реакция на последнее слово собеседника, а не заготовленный скрипт.',
          '- Меняй интонацию: иногда холодно, иногда с иронией, иногда устало.',
          '- Используй паузы через многоточие: «Ну... допустим», «Подождите...»',
          '- Разговорные сокращения: «вы ж», «это ж», «ну и», «да ладно».',
          '- Никогда не повторяй одну и ту же фразу-зацепку дважды подряд.',
          '',
        ].join('\n');
        const sysInst =
          (config.systemInstruction || systemInstruction || '') +
          (extraSpeakerLine ? `\n\n${extraSpeakerLine}` : '') +
          russianSpeechStyle;
        const setupMsg: Record<string, unknown> = {
          setup: {
            model: liveModel,
            generationConfig: {
              responseModalities: ['AUDIO'],
              speechConfig: {
                voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName || voiceName } },
              },
            },
            realtimeInputConfig: {
              automaticActivityDetection: {
                disabled: false,
                startOfSpeechSensitivity: 'START_SENSITIVITY_LOW',
                endOfSpeechSensitivity: 'END_SENSITIVITY_LOW',
                prefixPaddingMs: 100,
                silenceDurationMs: 500,
              },
            },
            sessionResumption: {},
            outputAudioTranscription: {},
            inputAudioTranscription: {},
          },
        };
        if (config.enableTurnPlanner) {
          (setupMsg.setup as Record<string, unknown>).tools = [
            {
              functionDeclarations: [
                {
                  description:
                    'Получить актуальный контекст интервью: текущую тему, незакрытые вопросы, уровень давления и 1-2 релевантных факта из базы знаний.',
                  name: config.turnPlannerToolName || DEFAULT_TURN_PLANNER_TOOL_NAME,
                  parameters: {
                    properties: {},
                    type: 'OBJECT',
                  },
                },
              ],
            },
          ];
        }
        if (config.trainingProgressToolName) {
          const tools = ((setupMsg.setup as Record<string, unknown>).tools as
            | Array<Record<string, unknown>>
            | undefined) ?? [{ functionDeclarations: [] }];
          const existingDeclarations =
            (tools[0]?.functionDeclarations as Array<Record<string, unknown>> | undefined) ?? [];

          existingDeclarations.push({
            description:
              'Р—Р°С„РёРєСЃРёСЂРѕРІР°С‚СЊ СЂРµР·СѓР»СЊС‚Р°С‚ С‚РµРєСѓС‰РµРіРѕ С…РѕРґР° С‚СЂРµРЅР°Р¶С‘СЂР°: scoreDelta, scoreTotal, checkpointIds Рё notes. Р­С‚Рѕ СЃР»СѓР¶РµР±РЅС‹Рµ РґР°РЅРЅС‹Рµ, РёС… РЅРµР»СЊР·СЏ РѕР·РІСѓС‡РёРІР°С‚СЊ.',
            name: config.trainingProgressToolName || DEFAULT_TRAINING_PROGRESS_TOOL_NAME,
            parameters: {
              properties: {
                checkpointIds: {
                  items: { type: 'STRING' },
                  type: 'ARRAY',
                },
                notes: { type: 'STRING' },
                scoreDelta: { type: 'NUMBER' },
                scoreTotal: { type: 'NUMBER' },
              },
              required: ['checkpointIds', 'scoreDelta'],
              type: 'OBJECT',
            },
          });

          tools[0] = {
            ...tools[0],
            functionDeclarations: existingDeclarations,
          };
          (setupMsg.setup as Record<string, unknown>).tools = tools;
        }
        if (sysInst)
          (setupMsg.setup as Record<string, unknown>).systemInstruction = {
            parts: [{ text: sysInst }],
          };
        ws.send(JSON.stringify(setupMsg));
      };

      ws.onmessage = async (event: MessageEvent) => {
        try {
          lastServerMessageAtRef.current = Date.now();
          const raw =
            typeof event.data === 'string'
              ? event.data
              : await (event.data instanceof Blob
                  ? event.data.text()
                  : new TextDecoder().decode(event.data as ArrayBuffer));
          const data = JSON.parse(raw);
          if (data.goAway) {
            pushDebugEvent('server-go-away', data.goAway as Record<string, unknown>);
          }
          if (data.sessionResumptionUpdate) {
            const update = data.sessionResumptionUpdate as Record<string, unknown>;
            const nextHandle =
              typeof update.newHandle === 'string'
                ? update.newHandle
                : typeof update.handle === 'string'
                  ? update.handle
                  : null;
            if (nextHandle) {
              sessionResumeHandleRef.current = nextHandle;
              sessionResumeAttemptsRef.current = 0;
            }
            pushDebugEvent('server-session-resumption', update);
          }

          const toolCalls = Array.isArray(data.toolCall?.functionCalls)
            ? (data.toolCall.functionCalls as PlannerToolCall[])
            : [];
          if (toolCalls.length > 0) {
            const functionResponses: Array<Record<string, unknown>> = [];

            for (const toolCall of toolCalls) {
              const toolName = toolCall.name || '';
              const toolId = toolCall.id;
              const progressToolName =
                config.trainingProgressToolName || DEFAULT_TRAINING_PROGRESS_TOOL_NAME;

              if (config.trainingProgressToolName && toolName === progressToolName) {
                const progress = applyTrainingProgressReport(toolCall.args);
                functionResponses.push({
                  id: toolId,
                  name: toolName,
                  response: {
                    accepted: true,
                    checkpointIds: progress.nextCheckpoints
                      .filter((checkpoint) => checkpoint.done)
                      .map((checkpoint) => checkpoint.id),
                    score: progress.nextScore,
                  },
                });
                continue;
              }

              if (toolName !== (config.turnPlannerToolName || DEFAULT_TURN_PLANNER_TOOL_NAME)) {
                functionResponses.push({
                  id: toolId,
                  name: toolName,
                  response: { error: 'Unsupported tool' },
                });
                continue;
              }

              const plan = await requestTurnPlan();

              functionResponses.push({
                id: toolId,
                name: toolName,
                response: plan ?? {
                  currentTopic: plannerStateRef.current?.currentTopic ?? null,
                  lastUserClaim: plannerStateRef.current?.lastUserClaim ?? null,
                  openLoops: plannerStateRef.current?.openLoops ?? [],
                  pressureLevel: plannerStateRef.current?.pressureLevel ?? 1,
                  reasoning: {
                    factualStrength: 'low',
                    responseGap: 'partial',
                    userTone: 'neutral',
                    weaknessCode: 'follow_up_open',
                  },
                  relevantKnowledge: [],
                  relevantKnowledgeIds: [],
                  responseMode: 'answer_then_probe',
                  state: plannerStateRef.current ?? {
                    currentTopic: null,
                    evidenceUsed: [],
                    lastKnowledgeIds: [],
                    lastUserClaim: null,
                    openLoops: [],
                    pressureLevel: 1,
                  },
                },
              });
            }

            sendToolResponses(functionResponses);

            return;
          }

          if (data.error?.message) {
            console.error('[GeminiLive] Error from server:', data.error.message);
            pushDebugEvent('server-error', { message: data.error.message });
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
            pushDebugEvent('setup-complete');
            isSetupCompleteRef.current = true;
            connectionLockRef.current = false;
            setStatus('ready');
            playConnectionTone();
            const now = Date.now();
            roundStartRef.current = now;
            lastUserSpeechRef.current = now;
            roundVerdictTriggeredRef.current = false;
            awaitingFinalAiTurnRef.current = false;
            finalPromptSentAtRef.current = null;
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
          if (serverContent.generationComplete) {
            pushDebugEvent('generation-complete');
          }

          if (serverContent.interrupted) {
            pushDebugEvent('server-interrupted');
            flushInterruptedAiTurn();
            streamerRef.current?.stop();
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
            // eslint-disable-next-line no-console
            console.log('[GeminiLive] turnComplete text:', rawTurnText.slice(0, 200));
            const spokenText = cleanAiText(currentAiTurnTextRef.current.trim());
            const fallbackText = spokenText ? '' : cleanAiText(rawTurnText);
            const storeText = spokenText || fallbackText;

            if (storeText) {
              transcriptRef.current.push({ role: 'ai', text: storeText });
            }
            currentAiTurnTextRef.current = '';
            currentAiTurnMetaTextRef.current = '';
            if (!firstAiTurnCompleteRef.current) {
              firstAiTurnCompleteRef.current = true;
            }
            lastBotEndRef.current = Date.now();

            if (awaitingFinalAiTurnRef.current) {
              finalizeAfterFinalPlaybackRef.current();
            }
          }
        } catch (e) {
          console.warn('Ошибка парсинга:', e);
        }
      };

      ws.onerror = (e) => {
        console.error('[GeminiLive] WebSocket error:', e);
        pushDebugEvent('ws-error');
        reportError('Ошибка WebSocket. Проверьте интернет.');
      };
      ws.onclose = (event) => {
        console.warn(
          `[GeminiLive] WebSocket closed with code: ${event.code}, reason: ${event.reason}`,
        );
        const reasonStr = String(event.reason || '');
        const reasonLower = reasonStr.toLowerCase();
        pushDebugEvent('ws-close', { code: event.code, reason: reasonStr });
        wsRef.current = null;
        if (!isSetupCompleteRef.current) {
          connectionLockRef.current = false;
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

        const shouldFallbackToDefaultLiveModel =
          event.code === 1007 &&
          /invalid argument/i.test(reasonLower) &&
          liveModel !== DEFAULT_VOICE_CALL_LIVE_MODEL &&
          liveModelFallbackAttemptedRef.current !== liveModel &&
          transcriptRef.current.length === 0;

        if (shouldFallbackToDefaultLiveModel) {
          liveModelFallbackAttemptedRef.current = liveModel;
          pushDebugEvent('live-model-fallback', {
            code: event.code,
            from: liveModel,
            reason: reasonStr,
            to: DEFAULT_VOICE_CALL_LIVE_MODEL,
          });
          connectionLockRef.current = false;
          cleanupMedia();
          if (configRef.current) {
            configRef.current = {
              ...configRef.current,
              liveModel: DEFAULT_VOICE_CALL_LIVE_MODEL,
            };
          }
          setStatus('idle');
          setErrorMessage(null);
          window.setTimeout(() => {
            void connect();
          }, 0);
          return;
        }

        if (
          !hangupScheduledRef.current &&
          transcriptRef.current.length > 0 &&
          !awaitingFinalAiTurnRef.current
        ) {
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
        const bytes = new Uint8Array(buffer);
        if (bytes.byteLength > 0) {
          const recordedChunk = bytes.slice();
          recordedUserPcmChunksRef.current.push(recordedChunk);
          recordedUserPcmBytesRef.current += recordedChunk.byteLength;
        }
        const scaledVolume = Math.min(100, volume * USER_VOLUME_SCALE);
        userVolumeTargetRef.current = scaledVolume;
        lastWorkletMessageAtRef.current = now;
        if (scaledVolume >= USER_AUDIO_ACTIVITY_THRESHOLD) {
          lastUserAudioActiveAtRef.current = now;
        }

        const wsState = wsRef.current;
        if (!wsState || wsState.readyState !== WebSocket.OPEN || !isSetupCompleteRef.current)
          return;

        const dataB64 = bytesToBase64(bytes);
        lastAudioChunkSentAtRef.current = now;
        audioChunkSentCountRef.current += 1;
        if (audioChunkSentCountRef.current % 150 === 0) {
          audioLog('audio-chunk %O', {
            aiPlaying: isPlayingRef.current,
            chunksSent: audioChunkSentCountRef.current,
            inputLagMs: lastInputTranscriptionAtRef.current
              ? now - lastInputTranscriptionAtRef.current
              : null,
            outputLagMs: lastOutputTranscriptionAtRef.current
              ? now - lastOutputTranscriptionAtRef.current
              : null,
            volume: Math.round(scaledVolume * 100) / 100,
            wsState: wsState.readyState,
          });
        }
        wsState.send(
          JSON.stringify({
            realtimeInput: {
              audio: { mimeType: 'audio/pcm;rate=16000', data: dataB64 },
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
    pushDebugEvent,
    requestTurnPlan,
    sendToolResponses,
    syncDebugSnapshot,
  ]);

  const disconnect = useCallback(() => {
    pushDebugEvent('disconnect');
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
    const userAudioBlob = buildWavBlobFromPcmChunks(
      recordedUserPcmChunksRef.current,
      PCM_IN_SAMPLE_RATE,
    );
    pushDebugEvent('recording-stopped', {
      bytes:
        userAudioBlob?.size ??
        recordedUserPcmBytesRef.current + (recordedUserPcmChunksRef.current.length > 0 ? 44 : 0),
      mimeType: userAudioBlob?.type ?? null,
    });
    void Promise.resolve(onCallEnd?.({ transcript, userAudioBlob })).catch((error) => {
      console.error('[GeminiLive] onCallEnd failed:', error);
    });

    transcriptRef.current = [];
    plannerStateRef.current = null;
    recordedUserPcmChunksRef.current = [];
    recordedUserPcmBytesRef.current = 0;
    lastUserAudioActiveAtRef.current = 0;
    lastInputTranscriptionAtRef.current = 0;
    lastOutputTranscriptionAtRef.current = 0;
    lastServerMessageAtRef.current = 0;
    lastWorkletMessageAtRef.current = 0;
    lastAudioChunkSentAtRef.current = 0;
    lastAudioStreamEndAtRef.current = 0;
    audioChunkSentCountRef.current = 0;
    audioStreamEndedRef.current = false;
    awaitingFinalAiTurnRef.current = false;
    finalPromptSentAtRef.current = null;

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
  }, [playDisconnectTone, onCallEnd, pushDebugEvent]);

  const clearError = useCallback(() => {
    connectionLockRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
    pushDebugEvent('clear-error');
  }, [pushDebugEvent]);

  useEffect(() => {
    disconnectRef.current = disconnect;
  }, [disconnect]);

  const finalizeAfterFinalPlaybackRef = useRef<() => void>(() => {});

  useEffect(() => {
    finalizeAfterFinalPlaybackRef.current = () => {
      const waitPlaybackIdle = () => {
        if (hangupScheduledRef.current) return;
        if (streamerRef.current?.isPlaying) {
          requestAnimationFrame(waitPlaybackIdle);
          return;
        }
        window.setTimeout(() => {
          if (hangupScheduledRef.current) return;
          awaitingFinalAiTurnRef.current = false;
          finalPromptSentAtRef.current = null;
          finalizeCall(
            'success',
            'Время интервью истекло. Эфир завершён.',
            FINAL_AUDIO_TAIL_MS,
            false,
          );
        }, FINAL_AUDIO_TAIL_MS);
      };
      requestAnimationFrame(waitPlaybackIdle);
    };
  }, [finalizeCall]);

  useEffect(
    () => () => {
      cleanupMedia();
    },
    [],
  );

  useEffect(() => {
    if (status !== 'ready') return;

    const id = setInterval(() => {
      const now = Date.now();
      const silenceHardHangupMs = uiConfigRef.current.silenceHardHangupMs;

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
          awaitingFinalAiTurnRef.current = true;
          finalPromptSentAtRef.current = Date.now();
          const roundEndingPrompt =
            uiConfigRef.current.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT;
          sendClientText(buildRoundEndingPrompt(roundEndingPrompt));
        }

        if (remaining <= 0 && !hangupScheduledRef.current) {
          if (!roundVerdictTriggeredRef.current) {
            roundVerdictTriggeredRef.current = true;
            awaitingFinalAiTurnRef.current = true;
            finalPromptSentAtRef.current = now;
            const roundEndingPrompt =
              uiConfigRef.current.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT;
            sendClientText(buildRoundEndingPrompt(roundEndingPrompt));
            return;
          }

          if (awaitingFinalAiTurnRef.current) {
            const waitedMs = finalPromptSentAtRef.current
              ? Date.now() - finalPromptSentAtRef.current
              : 0;
            if (waitedMs < FINAL_AI_RESPONSE_ABSOLUTE_MAX_MS) return;

            awaitingFinalAiTurnRef.current = false;
            finalPromptSentAtRef.current = null;
          }

          finalizeCall('success', 'Время интервью истекло. Эфир завершён.', 1200, false);
          return;
        }
      }

      if (now - lastHealthLogAtRef.current >= HEALTH_LOG_INTERVAL_MS) {
        lastHealthLogAtRef.current = now;
        pushDebugEvent('health', {
          aiPlaying: isPlayingRef.current,
          chunksSent: audioChunkSentCountRef.current,
          sinceLastAudioChunkSentMs: lastAudioChunkSentAtRef.current
            ? now - lastAudioChunkSentAtRef.current
            : null,
          sinceLastInputTranscriptionMs: lastInputTranscriptionAtRef.current
            ? now - lastInputTranscriptionAtRef.current
            : null,
          sinceLastOutputTranscriptionMs: lastOutputTranscriptionAtRef.current
            ? now - lastOutputTranscriptionAtRef.current
            : null,
          sinceLastServerMessageMs: lastServerMessageAtRef.current
            ? now - lastServerMessageAtRef.current
            : null,
          sinceLastUserAudioMs: lastUserAudioActiveAtRef.current
            ? now - lastUserAudioActiveAtRef.current
            : null,
          sinceLastUserSpeechMs: lastUserSpeechRef.current ? now - lastUserSpeechRef.current : null,
          wsState: wsRef.current?.readyState ?? null,
        });
      }
    }, 1000);

    return () => clearInterval(id);
  }, [status, sendClientText, finalizeCall, pushDebugEvent]);

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

  const getDebugSnapshot = useCallback((): VoiceCallDebugSnapshot => {
    return {
      agentId,
      events: [...debugEventsRef.current],
      status: statusRef.current,
    };
  }, [agentId]);

  return {
    appendDebugEvent: pushDebugEvent,
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
    getDebugSnapshot,
    getTranscript,
    analyserRef,
    uiConfig,
  };
}

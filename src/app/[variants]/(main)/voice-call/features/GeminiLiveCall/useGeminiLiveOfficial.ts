'use client';

import {
  EndSensitivity,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  Modality,
  type Session,
  StartSensitivity,
  Type,
} from '@google/genai/web';
import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_VOICE_CALL_AGENT_ID,
  DEFAULT_VOICE_CALL_LIVE_MODEL,
  GEMINI_31_FLASH_LIVE_MODEL,
} from '@/const/voiceCall';
import { useUserStore } from '@/store/user';
import { stripEnglishReasoning } from '@/utils/stripEnglishReasoning';
import { type VoiceCallDebugEvent, type VoiceCallDebugSnapshot } from '@/utils/voiceCallDebug';

import { AudioRecorder } from '../../beta/console/lib/audio-recorder';
import { AudioStreamer } from './AudioStreamer';
import type {
  GeminiLiveConfig,
  GeminiLiveUIConfig,
  HangUpReason,
  TranscriptEntry,
  UseGeminiLiveOptions,
  VoiceCallCheckpoint,
} from './useGeminiLive';

const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;
const USER_UTTERANCE_BREAK_MS = 2500;
const USER_VOLUME_SCALE = 500;
const MAX_DEBUG_EVENTS = 200;
const PATIENCE_INITIAL = 100;
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 15_000;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 15_000;
const DEFAULT_SILENCE_HARD_HANGUP_MS = 300_000;
const DEFAULT_SILENCE_NUDGE_PHRASES = ['Алло, вы меня вообще слышите?'];
const FINAL_PROMPT_MAX_WAIT_MS = 20_000;
const DEFAULT_TURN_PLANNER_TOOL_NAME = 'get_training_turn_context';
const DEFAULT_ASSISTANT_LABEL = 'ИИ-агент';
const DEFAULT_USER_LABEL = 'Вы';
const DEFAULT_VOICE_NAME = 'Sulafat';
const AI_VOLUME_FPS = 12;
const TURN_PLANNER_TIMEOUT_MS = 800;
const NUDGE_AI_QUIET_WINDOW_MS = 1800;

const log = debug('lobe-client:voice-call:live-official');

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

const buildRoundEndingPrompt = (rawPrompt: string) =>
  `${rawPrompt.trim()}\n\nВажно: если ты сейчас произносишь предыдущую реплику, ПРЕРВИСЬ и сразу начни финальную фразу. Скажи итог одним связным ответом и после этого замолчи.`;

const buildSilenceNudgeText = (
  template: string | null | undefined,
  fallbackPhrase: string,
  silenceSeconds: number,
) => {
  const phrase = fallbackPhrase.trim();
  const cleanedTemplate = template?.trim();
  if (!cleanedTemplate) return phrase;

  return cleanedTemplate
    .replaceAll('{{phrase}}', phrase)
    .replaceAll('{{silenceSeconds}}', String(silenceSeconds))
    .trim();
};

const base64ToBytes = (base64: string) => {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

function cleanAiText(text: string, options?: { stripEnglishReasoning?: boolean }) {
  let cleaned = text.replaceAll(/<think>[\s\S]*?<\/think>/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*SCORE\s*:|SCORE\s*:)\s*(?:[-+]\s*)?\d+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/(?:\[\s*CHECKPOINT\s*:|CHECKPOINT\s*:)\s*[A-Z_]+\s*\]?/gi, '');
  cleaned = cleaned.replaceAll(/\s+/g, ' ');
  if (options?.stripEnglishReasoning !== false) cleaned = stripEnglishReasoning(cleaned);

  return cleaned.trim();
}

const mergeLiveTranscriptionText = (prev: string, next: string) => {
  const a = prev.trim();
  const b = next.trim();

  if (!b) return a;
  if (!a) return b;
  if (b.startsWith(a) || b.includes(a)) return b;
  if (a.startsWith(b)) return a;

  return `${a} ${b}`.trim();
};

const isWhitespace = (char: string) => /\s/u.test(char);

const parseScoreDeltaSum = (text: string) => {
  const upper = text.toUpperCase();
  let index = 0;
  let total = 0;

  while (index < upper.length) {
    const found = upper.indexOf('SCORE', index);
    if (found === -1) break;

    let cursor = found + 5;
    while (cursor < upper.length && isWhitespace(upper[cursor])) cursor += 1;
    if (upper[cursor] !== ':') {
      index = cursor;
      continue;
    }
    cursor += 1;
    while (cursor < upper.length && isWhitespace(upper[cursor])) cursor += 1;

    let sign = 1;
    if (upper[cursor] === '+' || upper[cursor] === '-') {
      sign = upper[cursor] === '-' ? -1 : 1;
      cursor += 1;
      while (cursor < upper.length && isWhitespace(upper[cursor])) cursor += 1;
    }

    const start = cursor;
    while (cursor < upper.length && upper[cursor] >= '0' && upper[cursor] <= '9') cursor += 1;
    if (cursor > start) {
      const value = Number(upper.slice(start, cursor));
      if (Number.isFinite(value)) total += sign * value;
    }

    index = cursor;
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

    let cursor = found + 10;
    while (cursor < upper.length && isWhitespace(upper[cursor])) cursor += 1;
    if (upper[cursor] !== ':') {
      index = cursor;
      continue;
    }

    cursor += 1;
    while (cursor < upper.length && isWhitespace(upper[cursor])) cursor += 1;

    const start = cursor;
    while (cursor < upper.length) {
      const char = upper[cursor];
      if ((char >= 'A' && char <= 'Z') || char === '_') cursor += 1;
      else break;
    }

    if (cursor > start) ids.push(upper.slice(start, cursor));
    index = cursor;
  }

  return ids;
};

const normalizeUiConfig = (config: GeminiLiveConfig): GeminiLiveUIConfig => ({
  assistantLabel: config.assistantLabel || DEFAULT_ASSISTANT_LABEL,
  autoSuccessPrompt: config.autoSuccessPrompt ?? undefined,
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
  openingInstruction: config.openingInstruction ?? undefined,
  quietSpeakerNudge: config.quietSpeakerNudge ?? undefined,
  roundEndingPrompt: config.roundEndingPrompt ?? undefined,
  scoreDisplayLabel: config.scoreDisplayLabel ?? undefined,
  scoreLevelLabels: config.scoreLevelLabels ?? undefined,
  sessionDurationMs:
    config.sessionDurationMs ?? config.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
  shortAnswerNudge: config.shortAnswerNudge ?? undefined,
  showIntroDialog: config.showIntroDialog ?? true,
  silenceHardHangupMs: config.silenceHardHangupMs ?? DEFAULT_SILENCE_HARD_HANGUP_MS,
  silenceNudgeAfterMs: config.silenceNudgeAfterMs ?? DEFAULT_SILENCE_NUDGE_AFTER_MS,
  silenceNudgeCooldownMs: config.silenceNudgeCooldownMs ?? DEFAULT_SILENCE_NUDGE_COOLDOWN_MS,
  silenceNudgePhrases: config.silenceNudgePhrases?.length
    ? config.silenceNudgePhrases
    : DEFAULT_SILENCE_NUDGE_PHRASES,
  silenceNudgeTemplate: config.silenceNudgeTemplate ?? undefined,
  userLabel: config.userLabel || DEFAULT_USER_LABEL,
});

const toInitialCheckpoints = (config: GeminiLiveUIConfig): VoiceCallCheckpoint[] =>
  config.enableCheckpoints
    ? (config.goals?.length ? config.goals : []).map((label, index) => ({
        id: config.checkpointIds[index] || `goal-${index}`,
        label: label ?? '',
        done: false,
      }))
    : [];

const buildProxyBaseUrl = (url: string | null | undefined) => {
  if (!url?.trim()) return undefined;

  try {
    const parsed = new URL(url.trim());
    parsed.protocol = parsed.protocol === 'ws:' ? 'http:' : 'https:';
    parsed.search = '';
    parsed.hash = '';

    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
};

const resolveVoiceConnectErrorMessage = (error: unknown) => {
  const raw = error instanceof Error ? error.message : String(error || '');
  const normalized = raw.toLowerCase();

  if (
    normalized.includes('notallowederror') ||
    normalized.includes('permission denied') ||
    normalized.includes('permissiondismissederror')
  ) {
    return 'Доступ к микрофону запрещён. Разрешите доступ в браузере и попробуйте снова.';
  }

  if (normalized.includes('notfounderror') || normalized.includes('devicesnotfounderror')) {
    return 'Микрофон не найден. Подключите микрофон и попробуйте снова.';
  }

  if (
    normalized.includes('notreadableerror') ||
    normalized.includes('trackstarterror') ||
    normalized.includes('device is in use')
  ) {
    return 'Не удалось открыть микрофон: устройство занято другим приложением.';
  }

  if (normalized.includes('securityerror')) {
    return 'Браузер заблокировал доступ к микрофону по соображениям безопасности.';
  }

  return raw || 'Не удалось подключиться';
};

export function useGeminiLiveOfficial({
  agentId = DEFAULT_VOICE_CALL_AGENT_ID,
  interviewDurationMs,
  onCallEnd,
  onError,
  systemInstruction,
  voiceName = DEFAULT_VOICE_NAME,
  speakerName,
}: UseGeminiLiveOptions) {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [userVolume, setUserVolume] = useState(0);
  const [aiVolume, setAiVolume] = useState(0);
  const [score, setScore] = useState(0);
  const [hangUpByAi, setHangUpByAi] = useState(false);
  const [hangUpReason, setHangUpReason] = useState<HangUpReason>(null);
  const [checkpoints, setCheckpoints] = useState<VoiceCallCheckpoint[]>([]);
  const [uiConfig, setUiConfig] = useState<GeminiLiveUIConfig>({
    assistantLabel: DEFAULT_ASSISTANT_LABEL,
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
    userLabel: DEFAULT_USER_LABEL,
  });

  const debugEventsRef = useRef<VoiceCallDebugEvent[]>([]);
  const statusRef = useRef(status);
  const configRef = useRef<GeminiLiveConfig | null>(null);
  const configCacheKeyRef = useRef('');
  const uiConfigRef = useRef(uiConfig);
  const sessionRef = useRef<Session | null>(null);
  const audioRecorderRef = useRef<AudioRecorder | null>(null);
  const playContextRef = useRef<AudioContext | null>(null);
  const streamerRef = useRef<AudioStreamer | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const freqDataRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const transcriptRef = useRef<TranscriptEntry[]>([]);
  const currentAiTurnTextRef = useRef('');
  const currentAiTurnMetaTextRef = useRef('');
  const recordedUserPcmChunksRef = useRef<Uint8Array[]>([]);
  const recordedUserPcmBytesRef = useRef(0);
  const lastUserSpeechRef = useRef(0);
  const lastSilenceNudgeAtRef = useRef(0);
  const silenceNudgeCountRef = useRef(0);
  const speakerNameRef = useRef(speakerName?.trim() || '');
  const checkpointsRef = useRef<VoiceCallCheckpoint[]>([]);
  const connectionLockRef = useRef(false);
  const manualDisconnectRef = useRef(false);
  const hangupScheduledRef = useRef(false);
  const isSetupCompleteRef = useRef(false);
  const roundStartRef = useRef<number | null>(null);
  const roundVerdictTriggeredRef = useRef(false);
  const awaitingFinalAiTurnRef = useRef(false);
  const finalPromptSentAtRef = useRef<number | null>(null);
  const deductedSessionRef = useRef(false);
  const plannerStateRef = useRef<Record<string, unknown> | null>(null);
  const disconnectRef = useRef<() => void>(() => {});
  const lastAiVolumeAtRef = useRef(0);
  const lastAiVolumeValueRef = useRef(0);
  const lastAiActivityAtRef = useRef(0);

  const prewarmAudio = useCallback(() => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!playContextRef.current || playContextRef.current.state === 'closed') {
      playContextRef.current = new Ctx({ sampleRate: PCM_OUT_SAMPLE_RATE });
    }
    if (playContextRef.current.state === 'suspended') {
      // Важно для Safari/iOS: вызывается из пользовательского клика до любых await.
      void playContextRef.current.resume().catch((error) => {
        console.error('[GeminiLiveOfficial] audio resume failed:', error);
      });
    }
  }, []);

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
    uiConfigRef.current = uiConfig;
    checkpointsRef.current = checkpoints;
  }, [checkpoints, uiConfig]);

  useEffect(() => {
    speakerNameRef.current = speakerName?.trim() || '';
  }, [speakerName]);

  const pushDebugEvent = useCallback(
    (type: string, data?: Record<string, unknown>) => {
      const event: VoiceCallDebugEvent = {
        at: new Date().toISOString(),
        ...(data ? { data } : {}),
        type,
      };

      debugEventsRef.current = [...debugEventsRef.current.slice(-(MAX_DEBUG_EVENTS - 1)), event];
      syncDebugSnapshot();
    },
    [syncDebugSnapshot],
  );

  const reportError = useCallback(
    (message: string) => {
      setStatus('error');
      setErrorMessage(message);
      onError?.(message);
      pushDebugEvent('error', { message });
    },
    [onError, pushDebugEvent],
  );

  const cleanupMedia = useCallback(() => {
    try {
      audioRecorderRef.current?.stop();
      audioRecorderRef.current?.audioContext?.close?.();
    } catch (error) {
      log('cleanup-audio-error %O', error);
    }
    audioRecorderRef.current = null;

    try {
      sessionRef.current?.close();
    } catch (error) {
      log('cleanup-session-error %O', error);
    }
    sessionRef.current = null;

    streamerRef.current?.stop();
    analyserRef.current = null;
    freqDataRef.current = null;
  }, []);

  const requestTurnPlan = useCallback(async () => {
    const transcript = [...transcriptRef.current];

    try {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), TURN_PLANNER_TIMEOUT_MS);
      const response = await fetch('/api/voice-call/plan-turn', {
        body: JSON.stringify({
          agentId,
          previousState: plannerStateRef.current,
          transcript,
        }),
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      });
      window.clearTimeout(timeout);

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `Planner request failed: ${response.status}`);
      }

      const plan = (await response.json()) as { state?: Record<string, unknown> } & Record<
        string,
        unknown
      >;
      plannerStateRef.current = plan.state ?? null;
      pushDebugEvent('turn-plan', plan);

      return plan;
    } catch (error) {
      console.error('[GeminiLiveOfficial] turn planner failed:', error);
      pushDebugEvent('turn-plan-error', {
        message: error instanceof Error ? error.message : 'unknown planner error',
      });

      return null;
    }
  }, [agentId, pushDebugEvent]);

  const sendRealtimeText = useCallback(
    (text: string) => {
      const session = sessionRef.current;
      if (!session || !text.trim()) return;

      pushDebugEvent('client-text', { text: text.slice(0, 200) });
      session.sendRealtimeInput({ text });
    },
    [pushDebugEvent],
  );

  const finalizeCall = useCallback(
    (reason: Exclude<HangUpReason, null>, message: string, delayMs = 1200, markAsError = true) => {
      if (hangupScheduledRef.current) return;

      hangupScheduledRef.current = true;
      setHangUpReason(reason);
      setHangUpByAi(true);
      pushDebugEvent('finalize-call', { delayMs, markAsError, message, reason });

      if (markAsError) reportError(message);
      else setErrorMessage(message);

      window.setTimeout(() => {
        disconnectRef.current();
      }, delayMs);
    },
    [pushDebugEvent, reportError],
  );

  const maybeAutoFinish = useCallback(
    (latestScore: number) => {
      if (statusRef.current !== 'ready' || hangupScheduledRef.current) return;
      if (!uiConfigRef.current.enableCheckpoints || !uiConfigRef.current.enableScoring) return;

      const allDone =
        checkpointsRef.current.length > 0 && checkpointsRef.current.every((item) => item.done);
      const enoughDialogue = transcriptRef.current.length >= 6;
      if (!allDone || !enoughDialogue || latestScore < 12) return;

      const autoSuccessPrompt = uiConfigRef.current.autoSuccessPrompt;
      if (autoSuccessPrompt) sendRealtimeText(autoSuccessPrompt);

      window.setTimeout(() => {
        if (
          hangupScheduledRef.current ||
          statusRef.current !== 'ready' ||
          awaitingFinalAiTurnRef.current
        )
          return;
        finalizeCall('success', 'Интервью завершено: все цели достигнуты.', 1200, false);
      }, 9000);
    },
    [finalizeCall, sendRealtimeText],
  );

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    pushDebugEvent('disconnect');

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
      console.error('[GeminiLiveOfficial] onCallEnd failed:', error);
    });

    cleanupMedia();

    transcriptRef.current = [];
    plannerStateRef.current = null;
    recordedUserPcmChunksRef.current = [];
    recordedUserPcmBytesRef.current = 0;
    lastAiActivityAtRef.current = 0;
    // Важно: lastUserSpeechRef используется для вычисления тишины.
    // Если не сбросить между сессиями, "молчание" может считаться уже истёкшим.
    lastUserSpeechRef.current = 0;
    lastSilenceNudgeAtRef.current = 0;
    silenceNudgeCountRef.current = 0;
    roundStartRef.current = null;
    roundVerdictTriggeredRef.current = false;
    awaitingFinalAiTurnRef.current = false;
    finalPromptSentAtRef.current = null;
    deductedSessionRef.current = false;
    hangupScheduledRef.current = false;
    isSetupCompleteRef.current = false;
    connectionLockRef.current = false;
    manualDisconnectRef.current = false;

    setStatus('idle');
    setErrorMessage(null);
    setUserVolume(0);
    setAiVolume(0);
    setScore(0);
    setHangUpByAi(false);
    setHangUpReason(null);

    const nextCheckpoints = toInitialCheckpoints(uiConfigRef.current);
    setCheckpoints(nextCheckpoints);
    checkpointsRef.current = nextCheckpoints;
  }, [cleanupMedia, onCallEnd, pushDebugEvent]);

  disconnectRef.current = disconnect;

  const clearError = useCallback(() => {
    connectionLockRef.current = false;
    setStatus('idle');
    setErrorMessage(null);
    pushDebugEvent('clear-error');
  }, [pushDebugEvent]);

  const connect = useCallback(async () => {
    if (connectionLockRef.current) return;
    connectionLockRef.current = true;
    manualDisconnectRef.current = false;

    try {
      // До любых await: Safari/iOS требует resume AudioContext строго из пользовательского действия.
      prewarmAudio();

      const startRes = await fetch('/api/voice-call/start', {
        credentials: 'include',
        method: 'POST',
      });
      if (!startRes.ok) {
        const startPayload = (await startRes.json().catch(() => ({}))) as { error?: string };
        throw new Error(startPayload.error || 'Запуск тренажёра недоступен');
      }

      const trimmedName = speakerNameRef.current;
      const configCacheKey = `${agentId}::${trimmedName}`;
      if (configCacheKeyRef.current !== configCacheKey || !configRef.current) {
        const query = new URLSearchParams({ agentId });
        if (trimmedName) query.set('speakerName', trimmedName);
        if (interviewDurationMs && Number.isFinite(interviewDurationMs)) {
          query.set('durationMs', String(interviewDurationMs));
        }
        const res = await fetch(`/api/voice-call/config?${query.toString()}`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error(`Ошибка загрузки конфига: ${res.status}`);

        configRef.current = (await res.json()) as GeminiLiveConfig;
        configCacheKeyRef.current = configCacheKey;
      }

      const config = configRef.current;
      if (!config?.apiKey) throw new Error('Нет API-ключа Google.');

      const nextUiConfig = normalizeUiConfig(config);
      const nextCheckpoints = toInitialCheckpoints(nextUiConfig);
      uiConfigRef.current = nextUiConfig;
      checkpointsRef.current = nextCheckpoints;

      setUiConfig(nextUiConfig);
      setCheckpoints(nextCheckpoints);
      setStatus('connecting');
      setErrorMessage(null);
      setScore(0);
      setHangUpByAi(false);
      setHangUpReason(null);

      plannerStateRef.current = null;
      transcriptRef.current = [];
      currentAiTurnTextRef.current = '';
      currentAiTurnMetaTextRef.current = '';
      lastAiActivityAtRef.current = 0;
      recordedUserPcmChunksRef.current = [];
      recordedUserPcmBytesRef.current = 0;
      // lastUserSpeechRef влияет на старте таймера тишины — сбрасываем, чтобы nudge не срабатывал сразу.
      lastUserSpeechRef.current = 0;
      lastSilenceNudgeAtRef.current = 0;
      silenceNudgeCountRef.current = 0;
      roundStartRef.current = null;
      roundVerdictTriggeredRef.current = false;
      awaitingFinalAiTurnRef.current = false;
      finalPromptSentAtRef.current = null;
      deductedSessionRef.current = false;
      hangupScheduledRef.current = false;
      isSetupCompleteRef.current = false;
      debugEventsRef.current = [];
      syncDebugSnapshot();

      pushDebugEvent('connect-start', { agentId });
      // Контекст уже "застолбили" в prewarmAudio; здесь просто гарантируем, что он есть.
      prewarmAudio();

      if (!streamerRef.current) {
        const playContext = playContextRef.current;
        if (!playContext) throw new Error('Аудиоконтекст недоступен.');
        streamerRef.current = new AudioStreamer(playContext);
        analyserRef.current = streamerRef.current.analyser;
        freqDataRef.current = new Uint8Array(
          new ArrayBuffer(streamerRef.current.analyser.frequencyBinCount),
        );
      }

      const liveModel = config.liveModel?.trim() || GEMINI_31_FLASH_LIVE_MODEL;
      pushDebugEvent('live-model-selected', { liveModel });
      pushDebugEvent('recording-started', {
        format: 'wav',
        mimeType: 'audio/wav',
        sampleRate: PCM_IN_SAMPLE_RATE,
      });

      const extraSpeakerLine = trimmedName
        ? `\n- На вопросы сейчас отвечает сотрудник: ${trimmedName}. Обращайся к нему по имени.`
        : '';

      const russianSpeechStyle = `\n\n[СТИЛЬ РЕЧИ]\n- Говори на чистом, естественном русском языке без иностранного акцента. У тебя идеальная русская дикция, правильные ударения и интонации носителя языка.\n- Если в контенте встречаются англоязычные названия (бренды, продукты, аббревиатуры), произноси их по-русски — транслитерируй в кириллицу (например: GFD → «Джи-Эф-Ди», Tornado Energy → «Торнадо Энерджи»).\n- Держи спокойный темп. Используй больше точек и тире, допускай многоточия (...) для микропауз. Избегай длинных фраз на одном дыхании.\n`;

      const sysInst =
        (config.systemInstruction || systemInstruction || '') +
        (extraSpeakerLine ? `\n\n${extraSpeakerLine}` : '') +
        russianSpeechStyle;

      const liveConfig: LiveConnectConfig = {
        inputAudioTranscription: {},
        outputAudioTranscription: {},
        realtimeInputConfig: {
          automaticActivityDetection: {
            disabled: false,
            endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,
            prefixPaddingMs: 100,
            silenceDurationMs: 500,
            startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_LOW,
          },
        },
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: config.voiceName || voiceName || DEFAULT_VOICE_NAME,
            },
          },
        },
        ...(sysInst ? { systemInstruction: { parts: [{ text: sysInst }] } } : {}),
      };

      if (config.enableTurnPlanner) {
        liveConfig.tools = [
          {
            functionDeclarations: [
              {
                description:
                  'Получить актуальный контекст интервью: текущую тему, незакрытые вопросы, уровень давления и 1-2 релевантных факта из базы знаний.',
                name: config.turnPlannerToolName || DEFAULT_TURN_PLANNER_TOOL_NAME,
                parameters: {
                  properties: {},
                  type: Type.OBJECT,
                },
              },
            ],
          },
        ];
      }

      const proxyBaseUrl = buildProxyBaseUrl(config.geminiWsUrl);

      const client = new GoogleGenAI({
        apiKey: config.apiKey,
        httpOptions: {
          ...(proxyBaseUrl ? { baseUrl: proxyBaseUrl } : {}),
          apiVersion: 'v1beta',
        },
      });

      const OriginalWebSocket = window.WebSocket;
      if (config.geminiWsUrl) {
        const proxyWsUrl = config.geminiWsUrl;
        (window as any).WebSocket = class extends OriginalWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            let finalUrl = url.toString();
            if (finalUrl.includes('BidiGenerateContent')) {
              finalUrl = `${proxyWsUrl}${proxyWsUrl.includes('?') ? '&' : '?'}key=${encodeURIComponent(config.apiKey)}`;
            }
            super(finalUrl, protocols);
          }
        };
      }

      const flushInterruptedAiTurn = () => {
        // Поведение ближе к официальным Live API примерам:
        // при interrupted не фиксируем "обрезанный" turn в историю.
        currentAiTurnTextRef.current = '';
        currentAiTurnMetaTextRef.current = '';
      };

      const appendAiSpokenTranscription = (text: unknown) => {
        const next = typeof text === 'string' ? text.trim() : '';
        if (!next) return;
        lastAiActivityAtRef.current = Date.now();

        currentAiTurnTextRef.current = mergeLiveTranscriptionText(
          currentAiTurnTextRef.current,
          next,
        );
        pushDebugEvent('ai-output-transcription', { text: next.slice(0, 160) });
      };

      const upsertUserTranscript = (text: unknown) => {
        const inputText = typeof text === 'string' ? text.trim() : '';
        if (!inputText) return;

        const now = Date.now();
        const lastEntry = transcriptRef.current.at(-1);
        const startNewUtterance =
          lastEntry?.role !== 'user' || now - lastUserSpeechRef.current > USER_UTTERANCE_BREAK_MS;

        if (!startNewUtterance && lastEntry && lastEntry.role === 'user') {
          lastEntry.text = mergeLiveTranscriptionText(lastEntry.text, inputText);
        } else {
          transcriptRef.current.push({ role: 'user', text: inputText });
        }

        lastUserSpeechRef.current = now;
        silenceNudgeCountRef.current = 0;
        pushDebugEvent('user-input-transcription', { text: inputText.slice(0, 160) });
      };

      const sendStartTrigger = () => {
        const assistantLabel = uiConfigRef.current.assistantLabel || DEFAULT_ASSISTANT_LABEL;
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

        sendRealtimeText(startText);
      };

      const onmessage = async (message: LiveServerMessage) => {
        const payloadWithError = message as LiveServerMessage & { error?: { message?: string } };
        if (payloadWithError.error?.message) {
          if (transcriptRef.current.length > 0) {
            finalizeCall('ai', 'Соединение прервано сервером ИИ.', 1500, false);
          } else {
            reportError(payloadWithError.error.message);
          }
          return;
        }

        if (message.setupComplete) {
          isSetupCompleteRef.current = true;
          connectionLockRef.current = false;
          setStatus('ready');
          const now = Date.now();
          roundStartRef.current = now;
          lastUserSpeechRef.current = now;
          pushDebugEvent('setup-complete');
          sendStartTrigger();
          return;
        }

        if (message.toolCall?.functionCalls?.length) {
          const functionResponses = await Promise.all(
            message.toolCall.functionCalls.map(async (toolCall) => {
              const toolName = toolCall.name || '';
              if (toolName !== (config.turnPlannerToolName || DEFAULT_TURN_PLANNER_TOOL_NAME)) {
                return {
                  id: toolCall.id,
                  name: toolName,
                  response: { error: 'Unsupported tool' },
                };
              }

              const plan = await requestTurnPlan();
              return {
                id: toolCall.id,
                name: toolName,
                response:
                  plan ??
                  ({
                    currentTopic: null,
                    lastUserClaim: null,
                    openLoops: [],
                    pressureLevel: 1,
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
                  } satisfies Record<string, unknown>),
              };
            }),
          );

          sessionRef.current?.sendToolResponse({ functionResponses });
          return;
        }

        const serverContent = message.serverContent;
        if (!serverContent) return;

        if (serverContent.interrupted) {
          pushDebugEvent('server-interrupted');
          lastAiActivityAtRef.current = Date.now();
          flushInterruptedAiTurn();
          streamerRef.current?.stop();
          return;
        }

        appendAiSpokenTranscription(serverContent.outputTranscription?.text);
        upsertUserTranscript(serverContent.inputTranscription?.text);

        const parts = serverContent.modelTurn?.parts ?? [];
        for (const part of parts) {
          const audioB64 = part.inlineData?.data;
          if (audioB64) {
            lastAiActivityAtRef.current = Date.now();
            streamerRef.current?.addPCM16(audioB64);
          }
          if (part.text) currentAiTurnMetaTextRef.current += `${part.text} `;
        }

        if (serverContent.turnComplete) {
          const rawTurnText =
            `${currentAiTurnMetaTextRef.current} ${currentAiTurnTextRef.current}`.trim();

          if (uiConfigRef.current.enableScoring) {
            const totalDelta = parseScoreDeltaSum(rawTurnText);
            if (totalDelta !== 0) {
              setScore((prev) => {
                const nextScore = clamp(prev + totalDelta, -50, 50);
                maybeAutoFinish(nextScore);
                return nextScore;
              });
            }
          }

          if (uiConfigRef.current.enableCheckpoints) {
            const checkpointIds = parseCheckpointIds(rawTurnText);
            if (checkpointIds.length > 0) {
              const ids = new Set(checkpointIds.map((id) => id.toLowerCase()));
              const nextCheckpoints = checkpointsRef.current.map((item) =>
                ids.has(item.id.toLowerCase()) ? { ...item, done: true } : item,
              );
              checkpointsRef.current = nextCheckpoints;
              setCheckpoints(nextCheckpoints);
            }
          }

          const spokenText = cleanAiText(currentAiTurnTextRef.current.trim());
          const fallbackText = spokenText ? '' : cleanAiText(rawTurnText);
          const storeText = spokenText || fallbackText;
          if (storeText) transcriptRef.current.push({ role: 'ai', text: storeText });

          currentAiTurnTextRef.current = '';
          currentAiTurnMetaTextRef.current = '';

          if (awaitingFinalAiTurnRef.current) {
            awaitingFinalAiTurnRef.current = false;
            finalPromptSentAtRef.current = null;
            finalizeCall('success', 'Время интервью истекло. Эфир завершён.', 250, false);
          }
        }
      };

      let session;
      try {
        session = await client.live.connect({
          callbacks: {
            onclose: (event) => {
              pushDebugEvent('ws-close', { code: event.code, reason: event.reason || '' });
              sessionRef.current = null;
              connectionLockRef.current = false;

              if (manualDisconnectRef.current) return;

              if (!isSetupCompleteRef.current) {
                reportError(
                  `Live-соединение закрыто до старта (code: ${event.code}${event.reason ? `: ${event.reason}` : ''}).`,
                );
                return;
              }

              if (
                !hangupScheduledRef.current &&
                transcriptRef.current.length > 0 &&
                !awaitingFinalAiTurnRef.current
              ) {
                finalizeCall('ai', 'Соединение закрыто.', 1000, false);
                return;
              }

              setStatus('idle');
            },
            onerror: (event) => {
              log('sdk-error %O', event);
              pushDebugEvent('ws-error', {
                message: event.message || 'SDK live error',
              });
            },
            onmessage: (message) => {
              void onmessage(message);
            },
            onopen: () => {
              pushDebugEvent('ws-open');
            },
          },
          config: liveConfig,
          model: liveModel || DEFAULT_VOICE_CALL_LIVE_MODEL,
        });
      } finally {
        if (config.geminiWsUrl) {
          window.WebSocket = OriginalWebSocket;
        }
      }
      sessionRef.current = session;

      const recorder = new AudioRecorder(PCM_IN_SAMPLE_RATE);
      recorder
        .on('data', (base64: string) => {
          const chunk = base64ToBytes(base64);
          recordedUserPcmChunksRef.current.push(chunk);
          recordedUserPcmBytesRef.current += chunk.byteLength;

          const activeSession = sessionRef.current;
          if (!activeSession || !isSetupCompleteRef.current) return;

          activeSession.sendRealtimeInput({
            audio: {
              data: base64,
              mimeType: 'audio/pcm;rate=16000',
            },
          });
        })
        .on('volume', (volume: number) => {
          setUserVolume(Math.min(100, volume * USER_VOLUME_SCALE));
        });
      await recorder.start();
      audioRecorderRef.current = recorder;

      const track = recorder.stream?.getAudioTracks()?.[0];
      if (track) {
        pushDebugEvent('microphone-acquired', { settings: track.getSettings() });
      }
    } catch (error) {
      connectionLockRef.current = false;
      if (sessionRef.current) {
        try {
          sessionRef.current.close();
        } catch {
          // ignore close errors
        } finally {
          sessionRef.current = null;
        }
      }
      cleanupMedia();
      const message = resolveVoiceConnectErrorMessage(error);
      console.error('[GeminiLiveOfficial] connect failed:', error);
      reportError(message);
    }
  }, [
    agentId,
    interviewDurationMs,
    cleanupMedia,
    finalizeCall,
    maybeAutoFinish,
    prewarmAudio,
    pushDebugEvent,
    reportError,
    requestTurnPlan,
    sendRealtimeText,
    syncDebugSnapshot,
    systemInstruction,
    voiceName,
  ]);

  useEffect(() => {
    if (status !== 'ready') return;

    const id = window.setInterval(() => {
      const now = Date.now();
      const silenceHardHangupMs = uiConfigRef.current.silenceHardHangupMs;
      const silenceNudgeAfterMs = uiConfigRef.current.silenceNudgeAfterMs;
      const silenceNudgeCooldownMs = uiConfigRef.current.silenceNudgeCooldownMs;
      const silencePhrases = uiConfigRef.current.silenceNudgePhrases?.length
        ? uiConfigRef.current.silenceNudgePhrases
        : DEFAULT_SILENCE_NUDGE_PHRASES;

      if (roundStartRef.current && !deductedSessionRef.current) {
        const elapsed = now - roundStartRef.current;
        if (elapsed >= 60_000) {
          deductedSessionRef.current = true;
          fetch('/api/voice-call/deduct', { credentials: 'include', method: 'POST' })
            .then((res) => {
              if (res.ok) useUserStore.getState().refreshUserState();
            })
            .catch((error) => console.error('Failed to deduct session', error));
        }
      }

      if (!roundStartRef.current || !silenceHardHangupMs) return;

      const elapsed = now - roundStartRef.current;
      const remaining = silenceHardHangupMs - elapsed;

      if (!roundVerdictTriggeredRef.current && remaining <= 15_000 && remaining > 0) {
        roundVerdictTriggeredRef.current = true;
        const rawPrompt = uiConfigRef.current.roundEndingPrompt;
        if (rawPrompt) {
          awaitingFinalAiTurnRef.current = true;
          finalPromptSentAtRef.current = Date.now();
          sendRealtimeText(buildRoundEndingPrompt(rawPrompt));
        }
      }

      if (remaining <= 0 && !hangupScheduledRef.current) {
        if (awaitingFinalAiTurnRef.current) {
          const waitedMs = finalPromptSentAtRef.current
            ? Date.now() - finalPromptSentAtRef.current
            : 0;
          if (waitedMs < FINAL_PROMPT_MAX_WAIT_MS) return;

          // Если ИИ внезапно не отправил финальную фразу — не зависаем навсегда.
          awaitingFinalAiTurnRef.current = false;
          finalPromptSentAtRef.current = null;
        }

        finalizeCall('success', 'Время интервью истекло. Эфир завершён.', 1200, false);
      }

      // Фразы при тишине из БД (silenceNudgePhrases/silenceNudgeTemplate).
      const hasTranscript = transcriptRef.current.length > 0;
      const isFinalWindow = roundVerdictTriggeredRef.current || remaining <= 15_000;
      if (
        !hangupScheduledRef.current &&
        !awaitingFinalAiTurnRef.current &&
        !isFinalWindow &&
        hasTranscript &&
        silenceNudgeAfterMs > 0
      ) {
        const silenceSince = lastUserSpeechRef.current || roundStartRef.current || now;
        const silenceDuration = now - silenceSince;
        const canNudgeBySilence = silenceDuration >= silenceNudgeAfterMs;
        const canNudgeByCooldown =
          !lastSilenceNudgeAtRef.current ||
          now - lastSilenceNudgeAtRef.current >= silenceNudgeCooldownMs;

        const isAiCurrentlySpeaking =
          !!streamerRef.current?.isPlaying ||
          currentAiTurnTextRef.current.trim().length > 0 ||
          currentAiTurnMetaTextRef.current.trim().length > 0;
        const aiRecentlyActive =
          !!lastAiActivityAtRef.current &&
          now - lastAiActivityAtRef.current < NUDGE_AI_QUIET_WINDOW_MS;

        if (
          canNudgeBySilence &&
          canNudgeByCooldown &&
          !isAiCurrentlySpeaking &&
          !aiRecentlyActive
        ) {
          const phrase = silencePhrases[silenceNudgeCountRef.current % silencePhrases.length];
          const nudgeText = buildSilenceNudgeText(
            uiConfigRef.current.silenceNudgeTemplate,
            phrase,
            Math.floor(silenceDuration / 1000),
          );

          sendRealtimeText(nudgeText);
          silenceNudgeCountRef.current += 1;
          lastSilenceNudgeAtRef.current = now;
          pushDebugEvent('silence-nudge-sent', {
            nudgeText: nudgeText.slice(0, 200),
            silenceDurationMs: silenceDuration,
          });
        }
      }
    }, 1000);

    return () => window.clearInterval(id);
  }, [finalizeCall, sendRealtimeText, status]);

  useEffect(() => {
    if (status !== 'ready' && status !== 'connecting') {
      setAiVolume(0);
      return;
    }

    let rafId = 0;
    const tick = () => {
      const analyser = analyserRef.current;
      const freqData = freqDataRef.current;

      if (analyser && freqData) {
        analyser.getByteFrequencyData(freqData);
        const sum = freqData.reduce((total, value) => total + value, 0);
        const average = sum / Math.max(1, freqData.length);
        const nextValue = Math.round((average / 255) * 100);
        const now = performance.now();
        const minInterval = 1000 / AI_VOLUME_FPS;
        if (
          now - lastAiVolumeAtRef.current >= minInterval &&
          nextValue !== lastAiVolumeValueRef.current
        ) {
          lastAiVolumeAtRef.current = now;
          lastAiVolumeValueRef.current = nextValue;
          setAiVolume(nextValue);
        }
      }

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [status]);

  useEffect(() => {
    return () => {
      cleanupMedia();
    };
  }, [cleanupMedia]);

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
    aiVolume,
    analyserRef,
    appendDebugEvent: pushDebugEvent,
    checkpoints,
    clearError,
    connect,
    disconnect,
    errorMessage,
    getDebugSnapshot,
    getTranscript,
    hangUpByAi,
    hangUpReason,
    isCallActive: status === 'connecting' || status === 'ready',
    patience: PATIENCE_INITIAL,
    score,
    status,
    uiConfig,
    userVolume,
    prewarmAudio,
  };
}

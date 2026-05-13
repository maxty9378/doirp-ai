'use client';

import {
  EndSensitivity,
  GoogleGenAI,
  type LiveConnectConfig,
  type LiveServerMessage,
  MediaResolution,
  Modality,
  type Session,
  StartSensitivity,
  Type,
} from '@google/genai/web';
import debug from 'debug';
import { useCallback, useEffect, useRef, useState } from 'react';

import {
  DEFAULT_TRAINING_ROUND_ENDING_PROMPT,
  DEFAULT_VOICE_CALL_AGENT_ID,
  DEFAULT_VOICE_CALL_LIVE_MODEL,
  GEMINI_31_FLASH_LIVE_MODEL,
} from '@/const/voiceCall';
import { useUserStore } from '@/store/user';
import {
  persistVoiceCallDebugSnapshot,
  type VoiceCallDebugEvent,
  type VoiceCallDebugSnapshot,
} from '@/utils/voiceCallDebug';
import {
  buildVoiceCallContextWindowCompression,
  buildVoiceCallSessionResumptionConfig,
  finalizeAudibleAiTurnText,
  parseLiveServerDurationMs,
  resolveInitialAiTurnMicHoldDurations,
  shouldKeepInitialAiTurnMicGate,
  shouldResumeVoiceCallSession,
} from '@/utils/voiceCallLiveSession';
import { cleanVoiceAiText } from '@/utils/voiceCallSystemText';
import {
  applyTrainingProgress,
  DEFAULT_TRAINING_PROGRESS_TOOL_NAME,
  normalizeTrainingProgressArgs,
} from '@/utils/voiceCallTraining';
import {
  buildFallbackVoiceCallTurnPlan,
  type VoiceCallPlannerPlan,
  type VoiceCallPlannerState,
} from '@/utils/voiceCallTurnPlannerFallback';

import { AudioRecorder } from '../../beta/console/lib/audio-recorder';
import { AudioStreamer } from './AudioStreamer';
import { getSilenceNudgeDurationMs, shouldSendSilenceNudge } from './silenceNudge';
import {
  CLIENT_PROXY_PLACEHOLDER_KEY,
  DEFAULT_VOICE_CALL_PROXY_WS,
  type GeminiLiveConfig,
  type GeminiLiveUIConfig,
  type HangUpReason,
  type TranscriptEntry,
  type UseGeminiLiveOptions,
  type VoiceCallCheckpoint,
} from './useGeminiLive';

const PCM_IN_SAMPLE_RATE = 16_000;
const PCM_OUT_SAMPLE_RATE = 24_000;
const USER_UTTERANCE_BREAK_MS = 2500;
const USER_VOLUME_SCALE = 500;
const MAX_DEBUG_EVENTS = 200;
const PATIENCE_INITIAL = 100;
const DEFAULT_CONTEXT_WINDOW = 5;
const DEFAULT_SILENCE_NUDGE_AFTER_MS = 0;
const DEFAULT_SILENCE_NUDGE_COOLDOWN_MS = 0;
const DEFAULT_SILENCE_HARD_HANGUP_MS = 300_000;
const DEFAULT_SILENCE_NUDGE_PHRASES: string[] = [];
/** После отправки финального промпта ждём ответ модели не дольше (защита от зависания). */
const FINAL_AI_RESPONSE_ABSOLUTE_MAX_MS = 120_000;
/** Небольшая пауза после окончания воспроизведения PCM, чтобы не обрезать хвост. */
const FINAL_AUDIO_TAIL_MS = 400;
const DEFAULT_TURN_PLANNER_TOOL_NAME = 'get_training_turn_context';
const DEFAULT_ASSISTANT_LABEL = 'ИИ-агент';
const DEFAULT_USER_LABEL = 'Вы';
const DEFAULT_VOICE_NAME = 'Sulafat';
const AI_VOLUME_FPS = 12;
const TURN_PLANNER_TIMEOUT_MS = 2000;
const NUDGE_AI_QUIET_WINDOW_MS = 1800;
const MAX_SESSION_RESUME_ATTEMPTS = 3;
const SESSION_RESUME_RETRY_DELAY_MS = 250;

const log = debug('lobe-client:voice-call:live-official');

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

const cleanAiText = cleanVoiceAiText;

const mergeLiveTranscriptionText = (prev: string, next: string) => {
  const a = prev.trim();
  const b = next.trim();

  if (!b) return a;
  if (!a) return b;
  if (b.startsWith(a) || b.includes(a)) return b;
  if (a.startsWith(b)) return a;

  return `${a} ${b}`.trim();
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
  roundEndingPrompt: config.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT,
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

const createLiveAuthToken = async (url: string) => {
  const response = await fetch(url, {
    cache: 'no-store',
    credentials: 'include',
    method: 'POST',
  });
  const payload = (await response.json().catch(() => null)) as {
    apiVersion?: string;
    authToken?: string;
    error?: string;
  } | null;

  if (!response.ok) {
    throw new Error(payload?.error || `Live auth token request failed: ${response.status}`);
  }

  const authToken = payload?.authToken?.trim() || '';
  if (!authToken) {
    throw new Error('Live auth token is empty.');
  }

  return {
    apiVersion: payload?.apiVersion?.trim() || 'v1alpha',
    authToken,
  };
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
  const scoreRef = useRef(score);
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
  const currentAiTurnHasAudibleSignalRef = useRef(false);
  const allowTrainingProgressToolRef = useRef(true);
  const pendingProgressReportsRef = useRef<unknown[]>([]);
  const recordedUserPcmChunksRef = useRef<Uint8Array[]>([]);
  const recordedUserPcmBytesRef = useRef(0);
  const lastBotEndRef = useRef(0);
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
  const plannerStateRef = useRef<VoiceCallPlannerState | null>(null);
  const lastTurnPlanRef = useRef<VoiceCallPlannerPlan | null>(null);
  const connectRef = useRef<() => Promise<void> | void>(() => {});
  const disconnectRef = useRef<() => void>(() => {});
  const lastAiVolumeAtRef = useRef(0);
  const lastAiVolumeValueRef = useRef(0);
  const lastAiActivityAtRef = useRef(0);
  const lastUserVolumeAtRef = useRef(0);
  const sessionResumeHandleRef = useRef<string | null>(null);
  const sessionResumeAttemptsRef = useRef(0);
  const resumeTimerRef = useRef<number | null>(null);
  const resumeOnCloseRef = useRef(false);
  const isResumingSessionRef = useRef(false);
  const deferredClientTextRef = useRef<string | null>(null);
  const waitingForInitialAiTurnRef = useRef(false);
  const initialAiTurnMicGateUntilRef = useRef(0);
  const initialAiTurnMicHardGateUntilRef = useRef(0);

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

  const clearResumeTimer = useCallback(() => {
    if (resumeTimerRef.current !== null) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  const syncDebugSnapshot = useCallback(() => {
    if (typeof window === 'undefined') return;

    persistVoiceCallDebugSnapshot({
      agentId,
      events: [...debugEventsRef.current],
      status: statusRef.current,
    });
  }, [agentId]);

  useEffect(() => {
    statusRef.current = status;
    syncDebugSnapshot();
  }, [status, syncDebugSnapshot]);

  useEffect(() => {
    scoreRef.current = score;
  }, [score]);

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

  const markInitialAiTurnStarted = useCallback(
    (source: 'audio') => {
      if (!waitingForInitialAiTurnRef.current) return;

      waitingForInitialAiTurnRef.current = false;
      initialAiTurnMicGateUntilRef.current = 0;
      initialAiTurnMicHardGateUntilRef.current = 0;
      pushDebugEvent('initial-ai-turn-started', { source });
    },
    [pushDebugEvent],
  );

  const cleanupMedia = useCallback(() => {
    clearResumeTimer();
    resumeOnCloseRef.current = false;
    isResumingSessionRef.current = false;
    sessionResumeHandleRef.current = null;
    sessionResumeAttemptsRef.current = 0;
    deferredClientTextRef.current = null;
    waitingForInitialAiTurnRef.current = false;
    initialAiTurnMicGateUntilRef.current = 0;
    initialAiTurnMicHardGateUntilRef.current = 0;
    currentAiTurnHasAudibleSignalRef.current = false;
    allowTrainingProgressToolRef.current = !configRef.current?.trainingProgressToolName;
    pendingProgressReportsRef.current = [];

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
  }, [clearResumeTimer]);

  const requestTurnPlan = useCallback(async (): Promise<VoiceCallPlannerPlan> => {
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

      const plan = (await response.json()) as VoiceCallPlannerPlan;
      plannerStateRef.current = plan.state ?? null;
      lastTurnPlanRef.current = plan;
      pushDebugEvent('turn-plan', {
        currentTopic: plan.currentTopic,
        pressureLevel: plan.pressureLevel,
        responseMode: plan.responseMode,
        weaknessCode: plan.reasoning.weaknessCode,
      });

      return plan;
    } catch (error) {
      const fallbackPlan = buildFallbackVoiceCallTurnPlan({
        previousPlan: lastTurnPlanRef.current,
        previousState: plannerStateRef.current,
        transcript,
      });

      plannerStateRef.current = fallbackPlan.state;
      lastTurnPlanRef.current = fallbackPlan;
      console.error('[GeminiLiveOfficial] turn planner failed:', error);
      pushDebugEvent('turn-plan-error', {
        fallbackResponseMode: fallbackPlan.responseMode,
        message: error instanceof Error ? error.message : 'unknown planner error',
        weaknessCode: fallbackPlan.reasoning.weaknessCode,
      });

      return fallbackPlan;
    }
  }, [agentId, pushDebugEvent]);

  const flushDeferredClientText = useCallback(
    (targetSession?: Session | null) => {
      const session = targetSession ?? sessionRef.current;
      const deferredText = deferredClientTextRef.current?.trim();
      if (!session || !deferredText) return false;

      deferredClientTextRef.current = null;
      pushDebugEvent('client-text', { deferred: true, text: deferredText.slice(0, 200) });
      session.sendRealtimeInput({ text: deferredText });

      return true;
    },
    [pushDebugEvent],
  );

  const sendRealtimeText = useCallback(
    (text: string, options?: { deferUntilSessionReady?: boolean }) => {
      const nextText = text.trim();
      const session = sessionRef.current;
      if (!nextText) return false;

      if (!session) {
        if (options?.deferUntilSessionReady) {
          deferredClientTextRef.current = nextText;
          pushDebugEvent('client-text-deferred', { text: nextText.slice(0, 200) });
        }

        return false;
      }

      pushDebugEvent('client-text', { text: nextText.slice(0, 200) });
      session.sendRealtimeInput({ text: nextText });

      return true;
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

  const disconnect = useCallback(() => {
    manualDisconnectRef.current = true;
    pushDebugEvent('disconnect');

    const rawPendingAiText =
      `${currentAiTurnMetaTextRef.current} ${currentAiTurnTextRef.current}`.trim();
    const pendingSpokenText = cleanAiText(currentAiTurnTextRef.current.trim());
    const pendingAiText = finalizeAudibleAiTurnText({
      hasAudibleSignal: currentAiTurnHasAudibleSignalRef.current,
      metaText: rawPendingAiText ? cleanAiText(rawPendingAiText) : '',
      spokenText: pendingSpokenText,
    });
    if (pendingAiText) transcriptRef.current.push({ role: 'ai', text: pendingAiText });

    currentAiTurnTextRef.current = '';
    currentAiTurnMetaTextRef.current = '';
    currentAiTurnHasAudibleSignalRef.current = false;
    allowTrainingProgressToolRef.current = !configRef.current?.trainingProgressToolName;
    pendingProgressReportsRef.current = [];

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
    lastTurnPlanRef.current = null;
    currentAiTurnHasAudibleSignalRef.current = false;
    allowTrainingProgressToolRef.current = !configRef.current?.trainingProgressToolName;
    pendingProgressReportsRef.current = [];
    recordedUserPcmChunksRef.current = [];
    recordedUserPcmBytesRef.current = 0;
    lastAiActivityAtRef.current = 0;
    lastBotEndRef.current = 0;
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

  const clearError = useCallback(() => {
    clearResumeTimer();
    connectionLockRef.current = false;
    resumeOnCloseRef.current = false;
    isResumingSessionRef.current = false;
    sessionResumeHandleRef.current = null;
    sessionResumeAttemptsRef.current = 0;
    setStatus('idle');
    setErrorMessage(null);
    pushDebugEvent('clear-error');
  }, [clearResumeTimer, pushDebugEvent]);

  const connect = useCallback(async () => {
    if (connectionLockRef.current) return;
    connectionLockRef.current = true;
    manualDisconnectRef.current = false;
    const isResumeAttempt = isResumingSessionRef.current;
    const preservedCheckpoints = isResumeAttempt ? [...checkpointsRef.current] : null;
    const preservedCurrentAiTurnMetaText = isResumeAttempt ? currentAiTurnMetaTextRef.current : '';
    const preservedCurrentAiTurnText = isResumeAttempt ? currentAiTurnTextRef.current : '';
    const preservedCurrentAiTurnHasAudibleSignal = isResumeAttempt
      ? currentAiTurnHasAudibleSignalRef.current
      : false;
    const preservedAllowTrainingProgressTool = isResumeAttempt
      ? allowTrainingProgressToolRef.current
      : !configRef.current?.trainingProgressToolName;
    const preservedDebugEvents = isResumeAttempt ? [...debugEventsRef.current] : null;
    const preservedDeductedSession = isResumeAttempt ? deductedSessionRef.current : false;
    const preservedFinalPromptSentAt = isResumeAttempt ? finalPromptSentAtRef.current : null;
    const preservedLastAiActivityAt = isResumeAttempt ? lastAiActivityAtRef.current : 0;
    const preservedLastBotEndAt = isResumeAttempt ? lastBotEndRef.current : 0;
    const preservedLastSilenceNudgeAt = isResumeAttempt ? lastSilenceNudgeAtRef.current : 0;
    const preservedLastUserSpeechAt = isResumeAttempt ? lastUserSpeechRef.current : 0;
    const preservedLastTurnPlan = isResumeAttempt ? lastTurnPlanRef.current : null;
    const preservedPlannerState = isResumeAttempt ? plannerStateRef.current : null;
    const preservedPendingProgressReports = isResumeAttempt
      ? [...pendingProgressReportsRef.current]
      : [];
    const preservedRecordedUserPcmBytes = isResumeAttempt ? recordedUserPcmBytesRef.current : 0;
    const preservedRecordedUserPcmChunks = isResumeAttempt
      ? [...recordedUserPcmChunksRef.current]
      : [];
    const preservedRoundStartAt = isResumeAttempt ? roundStartRef.current : null;
    const preservedRoundVerdictTriggered = isResumeAttempt
      ? roundVerdictTriggeredRef.current
      : false;
    const preservedScore = isResumeAttempt ? scoreRef.current : 0;
    const preservedSessionResumeAttempts = isResumeAttempt ? sessionResumeAttemptsRef.current : 0;
    const preservedSessionResumeHandle = isResumeAttempt ? sessionResumeHandleRef.current : null;
    const preservedSilenceNudgeCount = isResumeAttempt ? silenceNudgeCountRef.current : 0;
    const preservedTranscript = isResumeAttempt ? [...transcriptRef.current] : [];
    const preservedAwaitingFinalAiTurn = isResumeAttempt ? awaitingFinalAiTurnRef.current : false;

    try {
      // До любых await: Safari/iOS требует resume AudioContext строго из пользовательского действия.
      prewarmAudio();

      if (!isResumeAttempt) {
        const startRes = await fetch('/api/voice-call/start', {
          credentials: 'include',
          method: 'POST',
        });
        if (!startRes.ok) {
          const startPayload = (await startRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(startPayload.error || 'Запуск тренажёра недоступен');
        }
      }

      const trimmedName = speakerNameRef.current;
      const durationCacheKey =
        interviewDurationMs && Number.isFinite(interviewDurationMs)
          ? String(interviewDurationMs)
          : '';
      const configCacheKey = `${agentId}::${trimmedName}::${durationCacheKey}`;
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
      if (!config) throw new Error('Не удалось загрузить конфиг звонка.');
      const effectiveGeminiWsUrl = config.geminiWsUrl || DEFAULT_VOICE_CALL_PROXY_WS;
      if (!effectiveGeminiWsUrl && !config.apiKey && !config.liveAuthTokenUrl) {
        throw new Error('Нет API-ключа Google.');
      }

      const nextUiConfig = normalizeUiConfig(config);
      const nextCheckpoints = toInitialCheckpoints(nextUiConfig);
      const liveModel = config.liveModel?.trim() || GEMINI_31_FLASH_LIVE_MODEL;
      uiConfigRef.current = nextUiConfig;
      checkpointsRef.current = nextCheckpoints;

      setUiConfig(nextUiConfig);
      setCheckpoints(nextCheckpoints);
      setStatus('connecting');
      setErrorMessage(null);
      setScore(0);
      setHangUpByAi(false);
      setHangUpReason(null);

      sessionResumeHandleRef.current = null;
      sessionResumeAttemptsRef.current = 0;
      resumeOnCloseRef.current = false;
      isResumingSessionRef.current = false;
      clearResumeTimer();

      plannerStateRef.current = null;
      lastTurnPlanRef.current = null;
      transcriptRef.current = [];
      currentAiTurnTextRef.current = '';
      currentAiTurnMetaTextRef.current = '';
      currentAiTurnHasAudibleSignalRef.current = false;
      allowTrainingProgressToolRef.current = !config.trainingProgressToolName;
      pendingProgressReportsRef.current = [];
      deferredClientTextRef.current = null;
      waitingForInitialAiTurnRef.current = false;
      initialAiTurnMicGateUntilRef.current = 0;
      initialAiTurnMicHardGateUntilRef.current = 0;
      lastAiActivityAtRef.current = 0;
      recordedUserPcmChunksRef.current = [];
      recordedUserPcmBytesRef.current = 0;
      lastBotEndRef.current = 0;
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

      if (isResumeAttempt) {
        isResumingSessionRef.current = true;
        checkpointsRef.current = preservedCheckpoints ?? [];
        currentAiTurnMetaTextRef.current = preservedCurrentAiTurnMetaText;
        currentAiTurnTextRef.current = preservedCurrentAiTurnText;
        currentAiTurnHasAudibleSignalRef.current = preservedCurrentAiTurnHasAudibleSignal;
        allowTrainingProgressToolRef.current = preservedAllowTrainingProgressTool;
        debugEventsRef.current = preservedDebugEvents ?? [];
        deductedSessionRef.current = preservedDeductedSession;
        finalPromptSentAtRef.current = preservedFinalPromptSentAt;
        lastAiActivityAtRef.current = preservedLastAiActivityAt;
        lastBotEndRef.current = preservedLastBotEndAt;
        lastSilenceNudgeAtRef.current = preservedLastSilenceNudgeAt;
        lastUserSpeechRef.current = preservedLastUserSpeechAt;
        lastTurnPlanRef.current = preservedLastTurnPlan;
        plannerStateRef.current = preservedPlannerState;
        pendingProgressReportsRef.current = preservedPendingProgressReports;
        recordedUserPcmBytesRef.current = preservedRecordedUserPcmBytes;
        recordedUserPcmChunksRef.current = preservedRecordedUserPcmChunks;
        roundStartRef.current = preservedRoundStartAt;
        roundVerdictTriggeredRef.current = preservedRoundVerdictTriggered;
        setCheckpoints(preservedCheckpoints ?? []);
        setScore(preservedScore);
        sessionResumeAttemptsRef.current = preservedSessionResumeAttempts;
        sessionResumeHandleRef.current = preservedSessionResumeHandle;
        silenceNudgeCountRef.current = preservedSilenceNudgeCount;
        transcriptRef.current = preservedTranscript;
        awaitingFinalAiTurnRef.current = preservedAwaitingFinalAiTurn;
        syncDebugSnapshot();
      }

      pushDebugEvent(isResumeAttempt ? 'connect-resume-start' : 'connect-start', { agentId });
      // Контекст уже "застолбили" в prewarmAudio; здесь просто гарантируем, что он есть.
      prewarmAudio();

      if (!streamerRef.current) {
        const playContext = playContextRef.current;
        if (!playContext) throw new Error('Аудиоконтекст недоступен.');
        streamerRef.current = new AudioStreamer(playContext);
        streamerRef.current.onPlayStateChange = (playing) => {
          pushDebugEvent('playback-state', {
            playing,
            ...streamerRef.current?.getDebugState(),
          });
        };
        analyserRef.current = streamerRef.current.analyser;
        freqDataRef.current = new Uint8Array(
          new ArrayBuffer(streamerRef.current.analyser.frequencyBinCount),
        );
      }

      pushDebugEvent('live-model-selected', { liveModel });
      if (!audioRecorderRef.current) {
        pushDebugEvent('recording-started', {
          format: 'wav',
          mimeType: 'audio/wav',
          sampleRate: PCM_IN_SAMPLE_RATE,
        });
      }

      const extraSpeakerLine = trimmedName
        ? `\n- На вопросы сейчас отвечает сотрудник: ${trimmedName}. Обращайся к нему по имени.`
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

      const baseLiveConfig: LiveConnectConfig = {
        inputAudioTranscription: {},
        mediaResolution: MediaResolution.MEDIA_RESOLUTION_MEDIUM,
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
        baseLiveConfig.tools = [
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
      if (config.trainingProgressToolName) {
        const tools = (baseLiveConfig.tools as
          | Array<{
              functionDeclarations?: Array<Record<string, unknown>>;
            }>
          | null
          | undefined) ?? [{ functionDeclarations: [] }];
        const existingDeclarations = tools[0]?.functionDeclarations ?? [];

        existingDeclarations.push({
          description:
            'Зафиксировать результат текущего хода тренажёра: scoreDelta, scoreTotal, checkpointIds и notes. Это служебные данные, их нельзя озвучивать.',
          name: config.trainingProgressToolName || DEFAULT_TRAINING_PROGRESS_TOOL_NAME,
          parameters: {
            properties: {
              checkpointIds: {
                items: { type: Type.STRING },
                type: Type.ARRAY,
              },
              notes: { type: Type.STRING },
              scoreDelta: { type: Type.NUMBER },
              scoreTotal: { type: Type.NUMBER },
            },
            required: ['checkpointIds', 'scoreDelta'],
            type: Type.OBJECT,
          },
        });

        tools[0] = {
          ...tools[0],
          functionDeclarations: existingDeclarations,
        };
        baseLiveConfig.tools = tools as LiveConnectConfig['tools'];
      }

      const proxyBaseUrl = buildProxyBaseUrl(effectiveGeminiWsUrl);
      const usesProxyTransport = !!proxyBaseUrl;
      let liveAuthToken = '';
      let liveApiVersion = 'v1beta';

      if (!usesProxyTransport && config.liveAuthTokenUrl) {
        try {
          const authTokenPayload = await createLiveAuthToken(config.liveAuthTokenUrl);
          liveAuthToken = authTokenPayload.authToken;
          liveApiVersion = authTokenPayload.apiVersion;
          pushDebugEvent('live-auth-token-created', {
            apiVersion: liveApiVersion,
          });
        } catch (error) {
          pushDebugEvent('live-auth-token-failed', {
            message: error instanceof Error ? error.message : String(error || 'Unknown error'),
          });

          if (!effectiveGeminiWsUrl && !config.apiKey) {
            throw error;
          }
        }
      }

      const client = new GoogleGenAI({
        apiKey: liveAuthToken || config.apiKey || CLIENT_PROXY_PLACEHOLDER_KEY,
        httpOptions: {
          ...(proxyBaseUrl ? { baseUrl: proxyBaseUrl } : {}),
          apiVersion: liveApiVersion,
        },
      });

      const OriginalWebSocket = window.WebSocket;

      const flushInterruptedAiTurn = () => {
        // Поведение ближе к официальным Live API примерам:
        // при interrupted не фиксируем "обрезанный" turn в историю.
        currentAiTurnTextRef.current = '';
        currentAiTurnMetaTextRef.current = '';
        currentAiTurnHasAudibleSignalRef.current = false;
        allowTrainingProgressToolRef.current = !config.trainingProgressToolName;
        pendingProgressReportsRef.current = [];
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
        lastBotEndRef.current = 0;
        silenceNudgeCountRef.current = 0;
        pushDebugEvent('user-input-transcription', { text: inputText.slice(0, 160) });
      };

      const sendStartTrigger = () => {
        const assistantLabel = uiConfigRef.current.assistantLabel || DEFAULT_ASSISTANT_LABEL;
        const progressToolName =
          config.trainingProgressToolName || DEFAULT_TRAINING_PROGRESS_TOOL_NAME;
        const { hardHoldMs, softHoldMs } = resolveInitialAiTurnMicHoldDurations({
          hasTrainingProgressTool: Boolean(config.trainingProgressToolName),
        });
        const nameLine = trimmedName
          ? `Собеседника зовут ${trimmedName}. Обязательно обратись к нему по имени в первой реплике.`
          : 'Обратись к собеседнику вежливо на «вы» в первой реплике.';
        const customOpening = config.openingInstruction?.trim();
        const defaultOpeningText = `Начинай интервью. Представься коротко как ${assistantLabel} и произнеси первую реплику в прямой речи. ${nameLine} Сразу задай первый уточняющий вопрос в формате живого эфира для зрителей.`;
        const firstTurnProgressRule = config.trainingProgressToolName
          ? `\n\n[FIRST TURN RULE]\n- In your opening reply, do not call ${progressToolName}.\n- First speak your introduction and your first question aloud.\n- Only from your next completed assistant turn onward may you call ${progressToolName}.`
          : '';
        const startText =
          (customOpening
            ? customOpening
                .replaceAll('{{assistantLabel}}', assistantLabel)
                .replaceAll('{{nameLine}}', nameLine)
                .replaceAll('{{speakerInstruction}}', nameLine)
            : defaultOpeningText) + firstTurnProgressRule;

        waitingForInitialAiTurnRef.current = true;
        initialAiTurnMicGateUntilRef.current = Date.now() + softHoldMs;
        initialAiTurnMicHardGateUntilRef.current = Date.now() + hardHoldMs;
        pushDebugEvent('initial-ai-turn-armed', {
          hardHoldMs,
          holdMs: softHoldMs,
        });
        sendRealtimeText(startText, { deferUntilSessionReady: true });
      };

      const buildSessionConfig = (resumeHandle?: string) => ({
        ...baseLiveConfig,
        contextWindowCompression: buildVoiceCallContextWindowCompression(),
        sessionResumption: buildVoiceCallSessionResumptionConfig(resumeHandle),
      });

      const scheduleSessionResume = (
        reason: 'close' | 'connect-error' | 'go-away',
        details?: Record<string, unknown>,
      ) => {
        const shouldResume = shouldResumeVoiceCallSession({
          attempts: sessionResumeAttemptsRef.current,
          hasResumeHandle: !!sessionResumeHandleRef.current,
          hasSessionState: roundStartRef.current !== null,
          isHangupScheduled: hangupScheduledRef.current,
          isManualDisconnect: manualDisconnectRef.current,
          isResumingConnection: isResumingSessionRef.current,
          maxAttempts: MAX_SESSION_RESUME_ATTEMPTS,
        });

        if (!shouldResume) return false;
        if (resumeTimerRef.current !== null) return true;

        const attempt = sessionResumeAttemptsRef.current + 1;
        sessionResumeAttemptsRef.current = attempt;
        connectionLockRef.current = false;
        isSetupCompleteRef.current = false;
        resumeOnCloseRef.current = false;
        isResumingSessionRef.current = true;
        setStatus('connecting');
        setErrorMessage(null);
        pushDebugEvent(
          'session-resume-scheduled',
          details ? { attempt, reason, ...details } : { attempt, reason },
        );

        resumeTimerRef.current = window.setTimeout(() => {
          resumeTimerRef.current = null;
          void connectRef.current?.();
        }, SESSION_RESUME_RETRY_DELAY_MS);

        return true;
      };

      const startAudioRecorderIfNeeded = async () => {
        if (audioRecorderRef.current) return;

        const recorder = new AudioRecorder(PCM_IN_SAMPLE_RATE);
        recorder
          .on('data', (base64: string) => {
            const chunk = base64ToBytes(base64);
            recordedUserPcmChunksRef.current.push(chunk);
            recordedUserPcmBytesRef.current += chunk.byteLength;

            const activeSession = sessionRef.current;
            if (!activeSession || !isSetupCompleteRef.current) return;

            if (waitingForInitialAiTurnRef.current) {
              const now = Date.now();
              const hasAnyAiSignal =
                currentAiTurnHasAudibleSignalRef.current ||
                transcriptRef.current.some(
                  (entry) => entry.role === 'ai' && entry.text.trim().length > 0,
                );

              if (
                shouldKeepInitialAiTurnMicGate({
                  hardGateUntil: initialAiTurnMicHardGateUntilRef.current,
                  hasAnyAiSignal,
                  now,
                  softGateUntil: initialAiTurnMicGateUntilRef.current,
                })
              )
                return;

              waitingForInitialAiTurnRef.current = false;
              initialAiTurnMicGateUntilRef.current = 0;
              initialAiTurnMicHardGateUntilRef.current = 0;
              pushDebugEvent('initial-ai-turn-mic-gate-released', {
                reason: hasAnyAiSignal ? 'soft-timeout' : 'hard-timeout',
              });
            }

            activeSession.sendRealtimeInput({
              audio: {
                data: base64,
                mimeType: 'audio/pcm;rate=16000',
              },
            });
          })
          .on('volume', (volume: number) => {
            const now = performance.now();
            if (now - lastUserVolumeAtRef.current < 1000 / 30) return; // 30 FPS max
            lastUserVolumeAtRef.current = now;
            setUserVolume(Math.min(100, volume * USER_VOLUME_SCALE));
          });
        await recorder.start();
        audioRecorderRef.current = recorder;

        const track = recorder.stream?.getAudioTracks()?.[0];
        if (track) {
          pushDebugEvent('microphone-acquired', { settings: track.getSettings() });
        }
      };

      const onmessage = async (message: LiveServerMessage) => {
        const payloadWithError = message as LiveServerMessage & {
          error?: { message?: string };
          inputTranscription?: { text?: string };
          outputTranscription?: { text?: string };
        };
        if (payloadWithError.error?.message) {
          if (transcriptRef.current.length > 0) {
            finalizeCall('ai', 'Соединение прервано сервером ИИ.', 1500, false);
          } else {
            reportError(payloadWithError.error.message);
          }
          return;
        }

        if (message.goAway) {
          const timeLeft = message.goAway.timeLeft ?? null;
          const timeLeftMs = parseLiveServerDurationMs(timeLeft);
          resumeOnCloseRef.current = true;
          pushDebugEvent('server-go-away', {
            ...(timeLeft ? { timeLeft } : {}),
            ...(timeLeftMs !== null ? { timeLeftMs } : {}),
          });
        }

        if (message.sessionResumptionUpdate) {
          const { lastConsumedClientMessageIndex, newHandle, resumable } =
            message.sessionResumptionUpdate;

          if (resumable && newHandle?.trim()) {
            sessionResumeHandleRef.current = newHandle.trim();
            sessionResumeAttemptsRef.current = 0;
          }

          pushDebugEvent('server-session-resumption', {
            hasHandle: !!newHandle,
            lastConsumedClientMessageIndex: lastConsumedClientMessageIndex ?? null,
            resumable: resumable ?? false,
          });
        }

        if (message.setupComplete) {
          const resumedSession = isResumingSessionRef.current;
          isResumingSessionRef.current = false;
          resumeOnCloseRef.current = false;
          isSetupCompleteRef.current = true;
          connectionLockRef.current = false;
          setStatus('ready');

          if (resumedSession) {
            pushDebugEvent('setup-complete-resumed', {
              attempt: sessionResumeAttemptsRef.current,
            });
          } else {
            const now = Date.now();
            roundStartRef.current = now;
            lastBotEndRef.current = 0;
            lastUserSpeechRef.current = 0;
            pushDebugEvent('setup-complete');
            sendStartTrigger();
          }
          return;
        }

        if (message.toolCall?.functionCalls?.length) {
          const functionResponses = await Promise.all(
            message.toolCall.functionCalls.map(async (toolCall) => {
              const toolName = toolCall.name || '';
              const progressToolName =
                config.trainingProgressToolName || DEFAULT_TRAINING_PROGRESS_TOOL_NAME;

              if (config.trainingProgressToolName && toolName === progressToolName) {
                if (!allowTrainingProgressToolRef.current) {
                  pushDebugEvent('training-progress-blocked-before-first-audible-turn', {
                    toolName,
                  });

                  return {
                    id: toolCall.id,
                    name: toolName,
                    response: {
                      accepted: false,
                      error: 'Call this tool only after the first spoken reply has finished.',
                    },
                  };
                }

                pendingProgressReportsRef.current = [
                  ...pendingProgressReportsRef.current,
                  toolCall.args as Record<string, unknown> | undefined,
                ];
                pushDebugEvent('training-progress-queued', {
                  queued: pendingProgressReportsRef.current.length,
                });

                return {
                  id: toolCall.id,
                  name: toolName,
                  response: {
                    accepted: true,
                    checkpointIds: checkpointsRef.current
                      .filter((checkpoint) => checkpoint.done)
                      .map((checkpoint) => checkpoint.id),
                    score: scoreRef.current,
                  },
                };
              }

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
                response: plan as unknown as Record<string, unknown>,
              };
            }),
          );

          sessionRef.current?.sendToolResponse({ functionResponses });
          return;
        }

        const serverContent = message.serverContent;
        if (!serverContent) return;

        const topLevelOutputText = payloadWithError.outputTranscription?.text;
        if (topLevelOutputText) appendAiSpokenTranscription(topLevelOutputText);

        const topLevelInputText = payloadWithError.inputTranscription?.text;
        if (topLevelInputText) upsertUserTranscript(topLevelInputText);

        if (serverContent.interrupted) {
          pushDebugEvent('server-interrupted');
          lastAiActivityAtRef.current = Date.now();
          flushInterruptedAiTurn();
          streamerRef.current?.stop();
          return;
        }

        if (!topLevelOutputText) {
          appendAiSpokenTranscription(serverContent.outputTranscription?.text);
        }
        if (!topLevelInputText) {
          upsertUserTranscript(serverContent.inputTranscription?.text);
        }

        const parts = serverContent.modelTurn?.parts ?? [];
        for (const part of parts) {
          const audioB64 = part.inlineData?.data;
          if (audioB64) {
            lastAiActivityAtRef.current = Date.now();
            currentAiTurnHasAudibleSignalRef.current = true;
            pushDebugEvent('ai-audio-chunk', {
              bytesBase64: audioB64.length,
              ...streamerRef.current?.getDebugState(),
            });
            markInitialAiTurnStarted('audio');
            streamerRef.current?.addPCM16(audioB64);
          }
          if (part.text) {
            currentAiTurnMetaTextRef.current += `${part.text} `;
          }
        }

        if (serverContent.turnComplete) {
          const flushedPendingAudio = streamerRef.current?.flushPending() ?? false;
          if (flushedPendingAudio) {
            pushDebugEvent('audio-prebuffer-flushed', {
              reason: 'turn-complete',
              ...streamerRef.current?.getDebugState(),
            });
          }

          const spokenText = cleanAiText(currentAiTurnTextRef.current.trim());
          const metaText = cleanAiText(currentAiTurnMetaTextRef.current.trim());
          const storeText = finalizeAudibleAiTurnText({
            hasAudibleSignal: currentAiTurnHasAudibleSignalRef.current,
            metaText,
            spokenText,
          });
          pushDebugEvent('ai-turn-complete', {
            flushedPendingAudio,
            hasAudibleSignal: currentAiTurnHasAudibleSignalRef.current,
            metaTextLength: metaText.length,
            spokenTextLength: spokenText.length,
            storedTextLength: storeText.length,
            ...streamerRef.current?.getDebugState(),
          });
          if (storeText) transcriptRef.current.push({ role: 'ai', text: storeText });
          lastBotEndRef.current = Date.now();

          if (currentAiTurnHasAudibleSignalRef.current) {
            allowTrainingProgressToolRef.current = true;
            for (const pendingReport of pendingProgressReportsRef.current) {
              applyTrainingProgressReport(pendingReport);
            }
          } else if (pendingProgressReportsRef.current.length > 0) {
            pushDebugEvent('training-progress-discarded', {
              reason: 'inaudible-ai-turn',
              reports: pendingProgressReportsRef.current.length,
            });
          }

          currentAiTurnTextRef.current = '';
          currentAiTurnMetaTextRef.current = '';
          currentAiTurnHasAudibleSignalRef.current = false;
          pendingProgressReportsRef.current = [];

          if (awaitingFinalAiTurnRef.current) {
            finalizeAfterFinalPlaybackRef.current();
          }
        }
      };

      const resumeHandle = isResumeAttempt
        ? sessionResumeHandleRef.current?.trim() || undefined
        : undefined;

      if (usesProxyTransport) {
        const proxyWsUrl = effectiveGeminiWsUrl;
        (window as any).WebSocket = class extends OriginalWebSocket {
          constructor(url: string | URL, protocols?: string | string[]) {
            let finalUrl = url.toString();
            if (finalUrl.includes('BidiGenerateContent')) {
              finalUrl = proxyWsUrl;
            }
            super(finalUrl, protocols);
          }
        };
      }

      let session;
      try {
        session = await client.live.connect({
          callbacks: {
            onclose: (event) => {
              pushDebugEvent('ws-close', {
                code: event.code,
                hasResumeHandle: !!sessionResumeHandleRef.current,
                reason: event.reason || '',
                resumeRequested: resumeOnCloseRef.current,
              });
              sessionRef.current = null;
              connectionLockRef.current = false;

              if (manualDisconnectRef.current || hangupScheduledRef.current) {
                setStatus('idle');
                return;
              }

              if (
                scheduleSessionResume(resumeOnCloseRef.current ? 'go-away' : 'close', {
                  code: event.code,
                  reason: event.reason || '',
                })
              ) {
                return;
              }

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
          config: buildSessionConfig(resumeHandle),
          model: liveModel || DEFAULT_VOICE_CALL_LIVE_MODEL,
        });
      } finally {
        if (usesProxyTransport) {
          window.WebSocket = OriginalWebSocket;
        }
      }
      sessionRef.current = session;
      flushDeferredClientText(session);

      await startAudioRecorderIfNeeded();
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
    clearResumeTimer,
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
    flushDeferredClientText,
    markInitialAiTurnStarted,
  ]);

  connectRef.current = connect;

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
        awaitingFinalAiTurnRef.current = true;
        finalPromptSentAtRef.current = Date.now();
        const rawPrompt =
          uiConfigRef.current.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT;
        sendRealtimeText(buildRoundEndingPrompt(rawPrompt));
      }

      if (remaining <= 0 && !hangupScheduledRef.current) {
        if (!roundVerdictTriggeredRef.current) {
          roundVerdictTriggeredRef.current = true;
          awaitingFinalAiTurnRef.current = true;
          finalPromptSentAtRef.current = now;
          const rawPrompt =
            uiConfigRef.current.roundEndingPrompt?.trim() || DEFAULT_TRAINING_ROUND_ENDING_PROMPT;
          sendRealtimeText(buildRoundEndingPrompt(rawPrompt));
          return;
        }

        if (awaitingFinalAiTurnRef.current) {
          const waitedMs = finalPromptSentAtRef.current ? now - finalPromptSentAtRef.current : 0;
          if (waitedMs < FINAL_AI_RESPONSE_ABSOLUTE_MAX_MS) return;

          awaitingFinalAiTurnRef.current = false;
          finalPromptSentAtRef.current = null;
        }

        finalizeCall('success', 'Время интервью истекло. Эфир завершён.', 1200, false);
      }

      // Фразы при тишине из БД (silenceNudgePhrases/silenceNudgeTemplate).
      const isFinalWindow = roundVerdictTriggeredRef.current || remaining <= 15_000;
      if (
        !hangupScheduledRef.current &&
        !awaitingFinalAiTurnRef.current &&
        !isFinalWindow &&
        silenceNudgeAfterMs > 0
      ) {
        const isAiCurrentlySpeaking =
          !!streamerRef.current?.isPlaying ||
          currentAiTurnTextRef.current.trim().length > 0 ||
          currentAiTurnMetaTextRef.current.trim().length > 0;
        const aiRecentlyActive =
          !!lastAiActivityAtRef.current &&
          now - lastAiActivityAtRef.current < NUDGE_AI_QUIET_WINDOW_MS;
        const silenceDuration = getSilenceNudgeDurationMs({
          lastBotEndAt: lastBotEndRef.current,
          lastUserSpeechAt: lastUserSpeechRef.current,
          now,
        });

        if (
          shouldSendSilenceNudge({
            aiRecentlyActive,
            isAiCurrentlySpeaking,
            lastBotEndAt: lastBotEndRef.current,
            lastSilenceNudgeAt: lastSilenceNudgeAtRef.current,
            lastUserSpeechAt: lastUserSpeechRef.current,
            now,
            silenceNudgeAfterMs,
            silenceNudgeCooldownMs,
          }) &&
          silenceDuration !== null
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

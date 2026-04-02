import type { ContextWindowCompressionConfig, SessionResumptionConfig } from '@google/genai/web';

const PROTO_DURATION_SECONDS_RE = /^(-?\d+(?:\.\d+)?)s$/i;
const DEFAULT_CONTEXT_COMPRESSION_TRIGGER_TOKENS = '104857';
const DEFAULT_CONTEXT_COMPRESSION_TARGET_TOKENS = '52428';

export const DEFAULT_VOICE_CALL_CONTEXT_WINDOW_COMPRESSION = {
  slidingWindow: {
    targetTokens: DEFAULT_CONTEXT_COMPRESSION_TARGET_TOKENS,
  },
  triggerTokens: DEFAULT_CONTEXT_COMPRESSION_TRIGGER_TOKENS,
} as const satisfies ContextWindowCompressionConfig;

interface ResumeDecisionParams {
  attempts: number;
  hasResumeHandle: boolean;
  hasSessionState: boolean;
  isHangupScheduled: boolean;
  isManualDisconnect: boolean;
  isResumingConnection: boolean;
  maxAttempts: number;
}

interface InitialAiTurnMicGateParams {
  hardGateUntil: number;
  hasAnyAiSignal: boolean;
  now: number;
  softGateUntil: number;
}

interface InitialAiTurnMicHoldDurationsParams {
  hasTrainingProgressTool: boolean;
}

interface FinalizeAiTurnTextParams {
  hasAudibleSignal: boolean;
  metaText: string;
  spokenText: string;
}

const DEFAULT_INITIAL_AI_TURN_MIC_HOLD_MS = 2500;
const DEFAULT_INITIAL_AI_TURN_MIC_HARD_HOLD_MS = 8000;
const TRAINING_PROGRESS_INITIAL_AI_TURN_MIC_HARD_HOLD_MS = 15000;

export const buildVoiceCallContextWindowCompression = (): ContextWindowCompressionConfig => ({
  ...DEFAULT_VOICE_CALL_CONTEXT_WINDOW_COMPRESSION,
});

export const buildVoiceCallSessionResumptionConfig = (
  handle?: string | null,
): SessionResumptionConfig => {
  const trimmedHandle = handle?.trim();

  return trimmedHandle ? { handle: trimmedHandle } : {};
};

export const parseLiveServerDurationMs = (value: string | null | undefined) => {
  if (!value) return null;

  const match = value.trim().match(PROTO_DURATION_SECONDS_RE);
  if (!match) return null;

  const seconds = Number(match[1]);
  if (!Number.isFinite(seconds)) return null;

  return Math.max(0, Math.round(seconds * 1000));
};

export const shouldResumeVoiceCallSession = ({
  attempts,
  hasResumeHandle,
  hasSessionState,
  isHangupScheduled,
  isManualDisconnect,
  isResumingConnection,
  maxAttempts,
}: ResumeDecisionParams) => {
  if (isManualDisconnect || isHangupScheduled) return false;
  if (!hasResumeHandle || attempts >= maxAttempts) return false;

  return hasSessionState || isResumingConnection;
};

export const shouldKeepInitialAiTurnMicGate = ({
  hardGateUntil,
  hasAnyAiSignal,
  now,
  softGateUntil,
}: InitialAiTurnMicGateParams) => {
  if (now < softGateUntil) return true;
  if (!hasAnyAiSignal && now < hardGateUntil) return true;

  return false;
};

export const resolveInitialAiTurnMicHoldDurations = ({
  hasTrainingProgressTool,
}: InitialAiTurnMicHoldDurationsParams) => ({
  hardHoldMs: hasTrainingProgressTool
    ? TRAINING_PROGRESS_INITIAL_AI_TURN_MIC_HARD_HOLD_MS
    : DEFAULT_INITIAL_AI_TURN_MIC_HARD_HOLD_MS,
  softHoldMs: DEFAULT_INITIAL_AI_TURN_MIC_HOLD_MS,
});

export const finalizeAudibleAiTurnText = ({
  hasAudibleSignal,
  metaText,
  spokenText,
}: FinalizeAiTurnTextParams) => {
  const cleanSpokenText = spokenText.trim();
  if (cleanSpokenText) return cleanSpokenText;
  if (!hasAudibleSignal) return '';

  return metaText.trim();
};

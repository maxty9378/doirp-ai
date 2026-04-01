import type { ContextWindowCompressionConfig, SessionResumptionConfig } from '@google/genai/web';

const PROTO_DURATION_SECONDS_RE = /^(-?\d+(?:\.\d+)?)s$/i;

export const DEFAULT_VOICE_CALL_CONTEXT_WINDOW_COMPRESSION = {
  slidingWindow: {},
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

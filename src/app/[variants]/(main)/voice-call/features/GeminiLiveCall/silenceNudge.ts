export interface SilenceNudgeDecisionInput {
  aiRecentlyActive: boolean;
  isAiCurrentlySpeaking: boolean;
  lastBotEndAt: number;
  lastSilenceNudgeAt: number;
  lastUserSpeechAt: number;
  now: number;
  silenceNudgeAfterMs: number;
  silenceNudgeCooldownMs: number;
}

export const getSilenceNudgeDurationMs = ({
  lastBotEndAt,
  lastUserSpeechAt,
  now,
}: Pick<SilenceNudgeDecisionInput, 'lastBotEndAt' | 'lastUserSpeechAt' | 'now'>) => {
  if (!lastBotEndAt) return null;
  if (lastUserSpeechAt > lastBotEndAt) return null;

  return now - lastBotEndAt;
};

export const shouldSendSilenceNudge = (input: SilenceNudgeDecisionInput) => {
  const silenceDurationMs = getSilenceNudgeDurationMs(input);
  if (silenceDurationMs === null) return false;
  if (silenceDurationMs < input.silenceNudgeAfterMs) return false;
  if (
    input.lastSilenceNudgeAt &&
    input.now - input.lastSilenceNudgeAt < input.silenceNudgeCooldownMs
  )
    return false;
  if (input.isAiCurrentlySpeaking || input.aiRecentlyActive) return false;

  return true;
};

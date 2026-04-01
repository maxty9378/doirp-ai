import { describe, expect, it } from 'vitest';

import { getSilenceNudgeDurationMs, shouldSendSilenceNudge } from './silenceNudge';

describe('silenceNudge', () => {
  describe('getSilenceNudgeDurationMs', () => {
    it('returns null when the assistant has not finished a turn yet', () => {
      expect(
        getSilenceNudgeDurationMs({
          lastBotEndAt: 0,
          lastUserSpeechAt: 0,
          now: 20_000,
        }),
      ).toBeNull();
    });

    it('returns null after the user already answered the assistant turn', () => {
      expect(
        getSilenceNudgeDurationMs({
          lastBotEndAt: 10_000,
          lastUserSpeechAt: 12_000,
          now: 30_000,
        }),
      ).toBeNull();
    });

    it('measures silence from the end of the last assistant turn', () => {
      expect(
        getSilenceNudgeDurationMs({
          lastBotEndAt: 10_000,
          lastUserSpeechAt: 0,
          now: 27_500,
        }),
      ).toBe(17_500);
    });
  });

  describe('shouldSendSilenceNudge', () => {
    const baseInput = {
      aiRecentlyActive: false,
      isAiCurrentlySpeaking: false,
      lastBotEndAt: 10_000,
      lastSilenceNudgeAt: 0,
      lastUserSpeechAt: 0,
      now: 26_000,
      silenceNudgeAfterMs: 15_000,
      silenceNudgeCooldownMs: 15_000,
    } satisfies Parameters<typeof shouldSendSilenceNudge>[0];

    it('does not fire before the silence threshold elapses', () => {
      expect(
        shouldSendSilenceNudge({
          ...baseInput,
          now: 24_000,
        }),
      ).toBe(false);
    });

    it('does not fire while the assistant is still speaking or was just active', () => {
      expect(
        shouldSendSilenceNudge({
          ...baseInput,
          isAiCurrentlySpeaking: true,
        }),
      ).toBe(false);

      expect(
        shouldSendSilenceNudge({
          ...baseInput,
          aiRecentlyActive: true,
        }),
      ).toBe(false);
    });

    it('does not fire during cooldown or after the user answered', () => {
      expect(
        shouldSendSilenceNudge({
          ...baseInput,
          lastSilenceNudgeAt: 20_000,
        }),
      ).toBe(false);

      expect(
        shouldSendSilenceNudge({
          ...baseInput,
          lastUserSpeechAt: 11_000,
        }),
      ).toBe(false);
    });

    it('fires only when the assistant is waiting for a user response long enough', () => {
      expect(shouldSendSilenceNudge(baseInput)).toBe(true);
    });
  });
});

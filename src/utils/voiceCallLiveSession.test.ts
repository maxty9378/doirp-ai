import { describe, expect, it } from 'vitest';

import {
  buildVoiceCallContextWindowCompression,
  buildVoiceCallSessionResumptionConfig,
  finalizeAudibleAiTurnText,
  parseLiveServerDurationMs,
  resolveInitialAiTurnMicHoldDurations,
  shouldKeepInitialAiTurnMicGate,
  shouldResumeVoiceCallSession,
} from './voiceCallLiveSession';

describe('voiceCallLiveSession', () => {
  it('builds default context window compression config', () => {
    expect(buildVoiceCallContextWindowCompression()).toEqual({
      slidingWindow: {
        targetTokens: '52428',
      },
      triggerTokens: '104857',
    });
  });

  it('builds session resumption config without handle for new sessions', () => {
    expect(buildVoiceCallSessionResumptionConfig()).toEqual({});
    expect(buildVoiceCallSessionResumptionConfig('   ')).toEqual({});
  });

  it('builds session resumption config with trimmed handle', () => {
    expect(buildVoiceCallSessionResumptionConfig('  handle-123  ')).toEqual({
      handle: 'handle-123',
    });
  });

  it('parses protobuf duration strings from goAway messages', () => {
    expect(parseLiveServerDurationMs('12s')).toBe(12_000);
    expect(parseLiveServerDurationMs('1.25s')).toBe(1250);
    expect(parseLiveServerDurationMs(undefined)).toBeNull();
    expect(parseLiveServerDurationMs('oops')).toBeNull();
  });

  it('allows resumption only for active resumable sessions under retry limit', () => {
    expect(
      shouldResumeVoiceCallSession({
        attempts: 0,
        hasResumeHandle: true,
        hasSessionState: true,
        isHangupScheduled: false,
        isManualDisconnect: false,
        isResumingConnection: false,
        maxAttempts: 3,
      }),
    ).toBe(true);

    expect(
      shouldResumeVoiceCallSession({
        attempts: 1,
        hasResumeHandle: true,
        hasSessionState: false,
        isHangupScheduled: false,
        isManualDisconnect: false,
        isResumingConnection: true,
        maxAttempts: 3,
      }),
    ).toBe(true);
  });

  it('blocks resumption when session is manual, finished, or out of retries', () => {
    expect(
      shouldResumeVoiceCallSession({
        attempts: 0,
        hasResumeHandle: false,
        hasSessionState: true,
        isHangupScheduled: false,
        isManualDisconnect: false,
        isResumingConnection: false,
        maxAttempts: 3,
      }),
    ).toBe(false);

    expect(
      shouldResumeVoiceCallSession({
        attempts: 3,
        hasResumeHandle: true,
        hasSessionState: true,
        isHangupScheduled: false,
        isManualDisconnect: false,
        isResumingConnection: false,
        maxAttempts: 3,
      }),
    ).toBe(false);

    expect(
      shouldResumeVoiceCallSession({
        attempts: 0,
        hasResumeHandle: true,
        hasSessionState: true,
        isHangupScheduled: true,
        isManualDisconnect: false,
        isResumingConnection: false,
        maxAttempts: 3,
      }),
    ).toBe(false);

    expect(
      shouldResumeVoiceCallSession({
        attempts: 0,
        hasResumeHandle: true,
        hasSessionState: true,
        isHangupScheduled: false,
        isManualDisconnect: true,
        isResumingConnection: false,
        maxAttempts: 3,
      }),
    ).toBe(false);
  });

  it('keeps the initial AI mic gate during the soft hold window', () => {
    expect(
      shouldKeepInitialAiTurnMicGate({
        hardGateUntil: 8000,
        hasAnyAiSignal: false,
        now: 2000,
        softGateUntil: 2500,
      }),
    ).toBe(true);
  });

  it('extends the initial AI mic gate until the hard timeout when the model stays silent', () => {
    expect(
      shouldKeepInitialAiTurnMicGate({
        hardGateUntil: 8000,
        hasAnyAiSignal: false,
        now: 4000,
        softGateUntil: 2500,
      }),
    ).toBe(true);
  });

  it('releases the initial AI mic gate after the soft window if the model has already started responding', () => {
    expect(
      shouldKeepInitialAiTurnMicGate({
        hardGateUntil: 8000,
        hasAnyAiSignal: true,
        now: 4000,
        softGateUntil: 2500,
      }),
    ).toBe(false);
  });

  it('releases the initial AI mic gate after the hard timeout even if the model stayed silent', () => {
    expect(
      shouldKeepInitialAiTurnMicGate({
        hardGateUntil: 8000,
        hasAnyAiSignal: false,
        now: 8100,
        softGateUntil: 2500,
      }),
    ).toBe(false);
  });

  it('extends the initial hard mic hold for scenarios with training progress tools', () => {
    expect(
      resolveInitialAiTurnMicHoldDurations({
        hasTrainingProgressTool: true,
      }),
    ).toEqual({
      hardHoldMs: 15000,
      softHoldMs: 2500,
    });
  });

  it('keeps the default initial hard mic hold for simple live scenarios', () => {
    expect(
      resolveInitialAiTurnMicHoldDurations({
        hasTrainingProgressTool: false,
      }),
    ).toEqual({
      hardHoldMs: 8000,
      softHoldMs: 2500,
    });
  });

  it('does not turn meta-only model text into a heard AI reply without audible signal', () => {
    expect(
      finalizeAudibleAiTurnText({
        hasAudibleSignal: false,
        metaText: 'Скрытый вопрос, который пользователь не слышал',
        spokenText: '',
      }),
    ).toBe('');
  });

  it('prefers spoken transcription when it exists', () => {
    expect(
      finalizeAudibleAiTurnText({
        hasAudibleSignal: true,
        metaText: 'Служебный текст',
        spokenText: 'Первый слышимый вопрос',
      }),
    ).toBe('Первый слышимый вопрос');
  });

  it('allows meta text only as a fallback for turns that had audible output', () => {
    expect(
      finalizeAudibleAiTurnText({
        hasAudibleSignal: true,
        metaText: 'Резервный текст озвученной реплики',
        spokenText: '',
      }),
    ).toBe('Резервный текст озвученной реплики');
  });
});

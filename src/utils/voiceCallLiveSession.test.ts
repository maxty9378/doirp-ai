import { describe, expect, it } from 'vitest';

import {
  buildVoiceCallContextWindowCompression,
  buildVoiceCallSessionResumptionConfig,
  parseLiveServerDurationMs,
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
});

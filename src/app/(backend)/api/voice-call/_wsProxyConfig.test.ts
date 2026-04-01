import { describe, expect, it } from 'vitest';

import {
  normalizeProxyBaseUrl,
  normalizeVoiceProxyUrl,
  PUBLIC_VOICE_PROXY_WS,
  resolveVoiceCallWsProxyUrl,
} from './_wsProxyConfig';

describe('voice call ws proxy config', () => {
  it('normalizes the legacy auth-protected proxy host to the public proxy endpoint', () => {
    expect(normalizeVoiceProxyUrl('wss://doirp-ai.vercel.app/voice-call-ws')).toBe(
      PUBLIC_VOICE_PROXY_WS,
    );
  });

  it('builds an HTTPS base URL from a WS endpoint', () => {
    expect(normalizeProxyBaseUrl('wss://voice-proxy.example.com/voice-call-ws?key=test')).toBe(
      'https://voice-proxy.example.com/voice-call-ws',
    );
  });

  it('prefers an explicit proxy URL when configured', () => {
    expect(
      resolveVoiceCallWsProxyUrl({
        explicitProxyUrl: 'wss://voice-proxy.example.com/voice-call-ws',
        nodeEnv: 'production',
      }),
    ).toBe('wss://voice-proxy.example.com/voice-call-ws');
  });

  it('uses the development proxy override before the public fallback', () => {
    expect(
      resolveVoiceCallWsProxyUrl({
        devProxyUrl: 'ws://localhost:3011',
        nodeEnv: 'development',
      }),
    ).toBe('ws://localhost:3011');
  });

  it('falls back to the public proxy endpoint in development when env is empty', () => {
    expect(resolveVoiceCallWsProxyUrl({ nodeEnv: 'development' })).toBe(PUBLIC_VOICE_PROXY_WS);
  });

  it('falls back to the public proxy endpoint in production when env is empty', () => {
    expect(resolveVoiceCallWsProxyUrl({ nodeEnv: 'production' })).toBe(PUBLIC_VOICE_PROXY_WS);
  });
});

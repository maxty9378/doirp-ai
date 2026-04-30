import { describe, expect, it } from 'vitest';

import {
  APP_VOICE_PROXY_PATH,
  buildAppVoiceProxyWsUrl,
  normalizeProxyBaseUrl,
  normalizeVoiceProxyUrl,
  PUBLIC_VOICE_PROXY_WS,
  resolveVoiceCallWsProxyUrl,
} from './_wsProxyConfig';

describe('voice call ws proxy config', () => {
  it('normalizes the legacy auth-protected proxy host to the app tunnel endpoint', () => {
    expect(normalizeVoiceProxyUrl('wss://doirp-ai.vercel.app/voice-call-ws')).toBe(
      `wss://doirp-ai.vercel.app${APP_VOICE_PROXY_PATH}`,
    );
  });

  it('normalizes the deprecated apidoirp proxy host to the current public proxy', () => {
    expect(normalizeVoiceProxyUrl('wss://apidoirp.ru/voice-call-ws')).toBe(PUBLIC_VOICE_PROXY_WS);
  });

  it('builds an HTTPS base URL from a WS endpoint', () => {
    expect(normalizeProxyBaseUrl('wss://voice-proxy.example.com/voice-call-ws?key=test')).toBe(
      'https://voice-proxy.example.com/voice-call-ws',
    );
  });

  it('builds a same-origin WS tunnel URL from APP_URL', () => {
    expect(buildAppVoiceProxyWsUrl('https://doirp-ai.vercel.app')).toBe(
      `wss://doirp-ai.vercel.app${APP_VOICE_PROXY_PATH}`,
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

  it('uses the public proxy endpoint in development by default', () => {
    expect(
      resolveVoiceCallWsProxyUrl({
        nodeEnv: 'development',
      }),
    ).toBe(PUBLIC_VOICE_PROXY_WS);
  });

  it('uses the public proxy endpoint in production by default', () => {
    expect(
      resolveVoiceCallWsProxyUrl({
        appUrl: 'https://doirp-ai.vercel.app',
        nodeEnv: 'production',
      }),
    ).toBe(PUBLIC_VOICE_PROXY_WS);
  });

  it('ignores the app tunnel flag and keeps the public proxy in production', () => {
    expect(
      resolveVoiceCallWsProxyUrl({
        appUrl: 'https://doirp-ai.vercel.app',
        nodeEnv: 'production',
        useAppTunnelInProduction: true,
      }),
    ).toBe(PUBLIC_VOICE_PROXY_WS);
  });

  it('falls back to the public proxy endpoint in production when APP_URL is empty', () => {
    expect(resolveVoiceCallWsProxyUrl({ appUrl: null, nodeEnv: 'production' })).toBe(
      PUBLIC_VOICE_PROXY_WS,
    );
  });
});

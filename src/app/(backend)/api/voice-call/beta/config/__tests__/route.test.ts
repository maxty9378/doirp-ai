import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { APP_VOICE_PROXY_PATH } from '../../../_wsProxyConfig';
import { GET } from '../route';

const DEFAULT_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';

const mockGetSession = vi.fn();
vi.mock('@/auth', () => ({
  auth: {
    api: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}));

vi.mock('next/headers', () => ({
  headers: vi.fn().mockResolvedValue(new Headers()),
}));

const mockGetLLMConfig = vi.fn();
vi.mock('@/envs/llm', () => ({
  getLLMConfig: () => mockGetLLMConfig(),
}));

vi.mock('@/envs/app', () => ({
  appEnv: {
    APP_URL: 'https://doirp-ai.vercel.app',
  },
}));

const mockApiKeyManagerPick = vi.fn();
vi.mock('@/server/modules/ModelRuntime/apiKeyManager', () => ({
  default: {
    pick: (key: unknown) => mockApiKeyManagerPick(key),
  },
}));

describe('GET /api/voice-call/beta/config', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();

    mockGetSession.mockResolvedValue({
      user: { id: 'user_001' },
    });
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('test-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(401);
  });

  it('returns 503 when GOOGLE_API_KEY is not configured', async () => {
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce(null);

    const res = await GET();

    expect(res.status).toBe(503);
  });

  it('returns proxy-mode payload with the public fallback proxyBaseUrl by default', async () => {
    const res = await GET();
    const body = (await res.json()) as {
      apiKey: string;
      defaultConfig: {
        contextWindowCompression?: {
          slidingWindow?: { targetTokens?: string };
          triggerTokens?: string;
        };
        mediaResolution?: string;
      };
      defaultModel: string;
      defaultVoice: string;
      proxyBaseUrl: string | null;
    };

    expect(res.status).toBe(200);
    expect(body.apiKey).toBe('test-key');
    expect(body.defaultConfig.contextWindowCompression).toEqual({
      slidingWindow: { targetTokens: '52428' },
      triggerTokens: '104857',
    });
    expect(body.defaultConfig.mediaResolution).toBe('MEDIA_RESOLUTION_MEDIUM');
    expect(body.defaultModel).toBe(DEFAULT_LIVE_MODEL);
    expect(body.defaultVoice).toBe('Aoede');
    expect(body.proxyBaseUrl).toBe(`https://doirp-ai.vercel.app${APP_VOICE_PROXY_PATH}`);
  });

  it('returns proxy-mode payload with normalized proxyBaseUrl', async () => {
    vi.stubEnv('VOICE_CALL_WS_PROXY_URL', 'wss://voice-proxy.example.com/voice-call-ws');

    const res = await GET();
    const body = (await res.json()) as { proxyBaseUrl: string | null };

    expect(res.status).toBe(200);
    expect(body.proxyBaseUrl).toBe('https://voice-proxy.example.com/voice-call-ws');
  });

  it('normalizes the legacy protected proxy URL to the public fallback', async () => {
    vi.stubEnv('VOICE_CALL_WS_PROXY_URL', 'wss://doirp-ai.vercel.app/voice-call-ws');

    const res = await GET();
    const body = (await res.json()) as { proxyBaseUrl: string | null };

    expect(res.status).toBe(200);
    expect(body.proxyBaseUrl).toBe(`https://doirp-ai.vercel.app${APP_VOICE_PROXY_PATH}`);
  });
});

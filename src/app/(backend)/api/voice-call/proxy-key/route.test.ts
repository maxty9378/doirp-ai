import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const mockGetLLMConfig = vi.fn();
vi.mock('@/envs/llm', () => ({
  getLLMConfig: () => mockGetLLMConfig(),
}));

const mockApiKeyManagerPick = vi.fn();
vi.mock('@/server/modules/ModelRuntime/apiKeyManager', () => ({
  default: {
    pick: (key: unknown) => mockApiKeyManagerPick(key),
  },
}));

describe('GET /api/voice-call/proxy-key', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('resolved-google-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when shared secret is missing', async () => {
    const res = await GET(new Request('http://localhost/api/voice-call/proxy-key'));

    expect(res.status).toBe(503);
  });

  it('returns 401 when bearer secret is missing or invalid', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');

    const res = await GET(new Request('http://localhost/api/voice-call/proxy-key'));

    expect(res.status).toBe(401);
  });

  it('returns 503 when GOOGLE_API_KEY is unavailable', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce('');

    const res = await GET(
      new Request('http://localhost/api/voice-call/proxy-key', {
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );

    expect(res.status).toBe(503);
  });

  it('returns the current resolved Google API key for an authorized proxy request', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');

    const res = await GET(
      new Request('http://localhost/api/voice-call/proxy-key', {
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');

    const body = (await res.json()) as { apiKey?: string };
    expect(body.apiKey).toBe('resolved-google-key');
  });
});

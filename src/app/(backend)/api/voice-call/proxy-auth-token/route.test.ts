import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const { mockCreateAuthToken, mockGoogleGenAI } = vi.hoisted(() => {
  const createAuthToken = vi.fn();
  const GoogleGenAI = vi.fn(() => ({
    authTokens: {
      create: createAuthToken,
    },
  }));

  return {
    mockCreateAuthToken: createAuthToken,
    mockGoogleGenAI: GoogleGenAI,
  };
});

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

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe('GET /api/voice-call/proxy-auth-token', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('resolved-google-key');
    mockCreateAuthToken.mockResolvedValue({ name: 'auth_tokens/test-token' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 503 when shared secret is missing', async () => {
    const res = await GET(new Request('http://localhost/api/voice-call/proxy-auth-token'));

    expect(res.status).toBe(503);
  });

  it('returns 401 when bearer secret is missing or invalid', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');

    const res = await GET(new Request('http://localhost/api/voice-call/proxy-auth-token'));

    expect(res.status).toBe(401);
  });

  it('returns 503 when GOOGLE_API_KEY is unavailable', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce('');

    const res = await GET(
      new Request('http://localhost/api/voice-call/proxy-auth-token', {
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );

    expect(res.status).toBe(503);
  });

  it('returns a short-lived live auth token for an authorized proxy request', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');

    const res = await GET(
      new Request('http://localhost/api/voice-call/proxy-auth-token', {
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toContain('no-store');
    expect(mockGoogleGenAI).toHaveBeenCalledWith({
      apiKey: 'resolved-google-key',
      httpOptions: { apiVersion: 'v1alpha' },
    });
    expect(mockCreateAuthToken).toHaveBeenCalledTimes(1);

    const body = (await res.json()) as { apiVersion?: string; authToken?: string };
    expect(body.apiVersion).toBe('v1alpha');
    expect(body.authToken).toBe('auth_tokens/test-token');
  });

  it('returns 500 when Google returns an empty token', async () => {
    vi.stubEnv('VOICE_CALL_PROXY_SHARED_SECRET', 'shared-secret');
    mockCreateAuthToken.mockResolvedValueOnce({});

    const res = await GET(
      new Request('http://localhost/api/voice-call/proxy-auth-token', {
        headers: { Authorization: 'Bearer shared-secret' },
      }),
    );

    expect(res.status).toBe(500);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

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

const mockApiKeyManagerPick = vi.fn();
vi.mock('@/server/modules/ModelRuntime/apiKeyManager', () => ({
  default: {
    pick: (key: unknown) => mockApiKeyManagerPick(key),
  },
}));

vi.mock('@google/genai', () => ({
  GoogleGenAI: mockGoogleGenAI,
}));

describe('POST /api/voice-call/auth-token', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({ user: { id: 'user_001' } });
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('resolved-google-key');
    mockCreateAuthToken.mockResolvedValue({ name: 'auth_tokens/test-token' });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session is missing', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const res = await POST();

    expect(res.status).toBe(401);
  });

  it('returns 503 when GOOGLE_API_KEY is unavailable', async () => {
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce('');

    const res = await POST();

    expect(res.status).toBe(503);
  });

  it('returns a short-lived live auth token', async () => {
    const res = await POST();

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
    mockCreateAuthToken.mockResolvedValueOnce({});

    const res = await POST();

    expect(res.status).toBe(500);
  });
});

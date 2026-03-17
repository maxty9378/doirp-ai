/**
 * Tests for GET /api/voice-call/config — scoreDisplayLabel and GFD fallback.
 * Run: bunx vitest run --silent='passed-only' 'src/app/(backend)/api/voice-call/config/__tests__/route.test.ts'
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const GFD_KEY = 'training-gfd-stress';
const SCORE_LABEL_GFD = 'Градус провокации';

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

const mockGetTrainingScenarioWithKnowledge = vi.fn();
vi.mock('@/server/services/training', () => ({
  getTrainingScenarioWithKnowledge: (key: string) => mockGetTrainingScenarioWithKnowledge(key),
  buildTrainingKnowledgeContext: vi.fn().mockReturnValue(null),
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

vi.mock('@/config/initialAgents', () => ({
  VOICE_CALL_PRESETS: {},
  VOICE_SIMULATOR_LPR_PRESET: { systemRole: 'Test system role' },
}));

describe('GET /api/voice-call/config', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_001', username: 'tester', email: 'tester@local.host' },
    });
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('test-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 503 when GOOGLE_API_KEY is not configured', async () => {
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce(null);
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      scenario: {
        systemPrompt: 'Test',
        scoreDisplayLabel: SCORE_LABEL_GFD,
        voiceName: 'Kore',
        contextWindow: 5,
        goals: [],
      },
      knowledgeEntries: [],
    });

    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(503);
  });

  it('returns scoreDisplayLabel "Градус провокации" when scenario from DB has it', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      scenario: {
        systemPrompt: 'System prompt from DB',
        scoreDisplayLabel: SCORE_LABEL_GFD,
        scoreLevelLabels: { low: 'Нужно улучшить', mid: 'Неплохо', high: 'Отлично' },
        voiceName: 'Kore',
        contextWindow: 5,
        goals: [],
        title: 'GFD: Стресс‑интервью',
        legend: 'Legend',
        showLegend: true,
        assistantLabel: 'Журналистка-расследователь',
        userLabel: 'Вы (Маркетолог GFD)',
      },
      knowledgeEntries: [],
    });

    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scoreDisplayLabel?: string | null };
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
  });

  it('returns scoreDisplayLabel "Градус провокации" from GFD fallback when DB returns null', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce(null);

    const { GET } = await import('../route');
    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scoreDisplayLabel?: string | null };
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
  });
});

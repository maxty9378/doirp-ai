/**
 * Tests for GET /api/voice-call/config — scoreDisplayLabel and GFD fallback.
 * Run: bunx vitest run --silent='passed-only' 'src/app/(backend)/api/voice-call/config/__tests__/route.test.ts'
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from '../route';

const GFD_KEY = 'training-gfd-stress';
const SCORE_LABEL_GFD = 'ЭФИРНЫЙ ПРЕССИНГ';

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
}));

const mockSelectLimit = vi.fn().mockResolvedValue([{ role: null, accountType: null }]);
const mockSelectWhere = vi.fn().mockReturnValue({ limit: mockSelectLimit });
const mockSelectLeftJoin = vi.fn().mockReturnValue({ where: mockSelectWhere });
const mockSelectFrom = vi.fn().mockReturnValue({ leftJoin: mockSelectLeftJoin });
const mockDbSelect = vi.fn().mockReturnValue({ from: mockSelectFrom });
vi.mock('@/database/server', () => ({
  serverDB: {
    select: (...args: unknown[]) => mockDbSelect(...args),
  },
}));

describe('GET /api/voice-call/config', () => {
  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      user: { id: 'user_001', username: 'tester', email: 'tester@local.host' },
    });
    mockGetLLMConfig.mockReturnValue({ GOOGLE_API_KEY: 'test-key' });
    mockApiKeyManagerPick.mockReturnValue('test-key');
    mockSelectLimit.mockResolvedValue([{ role: null, accountType: null }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when session has no user', async () => {
    mockGetSession.mockResolvedValueOnce(null);

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(401);
  }, 10000);

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

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(503);
  });

  it('returns scoreDisplayLabel "ЭФИРНЫЙ ПРЕССИНГ" when scenario from DB has it', async () => {
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

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scoreDisplayLabel?: string | null };
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
  });

  it('returns scoreDisplayLabel "ЭФИРНЫЙ ПРЕССИНГ" from GFD fallback when DB returns null', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce(null);

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { scoreDisplayLabel?: string | null };
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
  });
});

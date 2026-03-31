import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from '../route';

const GFD_KEY = 'training-gfd-stress';
const GFD_GOOGLE_LIVE_KEY = 'training-gfd-stress-google-live';
const DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const GFD_GOOGLE_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
const SCORE_LABEL_GFD = 'РЕЗУЛЬТАТ';

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
  });

  it('returns 503 when GOOGLE_API_KEY is not configured', async () => {
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce(null);
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      scenario: {
        systemPrompt: 'System prompt from DB',
        scoreDisplayLabel: SCORE_LABEL_GFD,
        voiceName: 'Sulafat',
        contextWindow: 5,
        goals: [],
      },
      knowledgeEntries: [],
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(503);
  });

  it('returns scoreDisplayLabel from DB scenario', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      scenario: {
        assistantLabel: 'Журналистка-расследователь',
        contextWindow: 5,
        goals: [],
        legend: 'Legend',
        scoreDisplayLabel: SCORE_LABEL_GFD,
        scoreLevelLabels: { high: 'Отлично', low: 'Нужно улучшить', mid: 'Неплохо' },
        showLegend: true,
        systemPrompt: 'System prompt from DB',
        title: 'GFD: Стресс-интервью',
        userLabel: 'Вы (Маркетолог GFD)',
        voiceName: 'Sulafat',
      },
      knowledgeEntries: [],
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      liveModel?: string | null;
      scoreDisplayLabel?: string | null;
    };
    expect(body.liveModel).toBe(DEFAULT_LIVE_MODEL);
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
  });

  it('returns Gemini 3.1 model for the dedicated Google Live trainer', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      scenario: {
        contextWindow: 5,
        goals: [],
        systemPrompt: 'System prompt from DB',
        voiceName: 'Sulafat',
      },
      knowledgeEntries: [],
    });

    const req = new Request(
      `http://localhost/api/voice-call/config?agentId=${GFD_GOOGLE_LIVE_KEY}`,
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { liveModel?: string | null };
    expect(body.liveModel).toBe(GFD_GOOGLE_LIVE_MODEL);
  });

  it('returns 404 when training scenario is missing in DB', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce(null);

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(404);
  });
});

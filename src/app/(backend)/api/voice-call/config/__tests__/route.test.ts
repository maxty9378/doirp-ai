import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DEFAULT_TRAINING_ROUND_ENDING_PROMPT } from '@/const/voiceCall';

import { PUBLIC_VOICE_PROXY_WS } from '../../_wsProxyConfig';
import { GET } from '../route';

const GFD_KEY = 'training-gfd-stress';
const GFD_GOOGLE_LIVE_KEY = 'training-gfd-stress-google-live';
const DEFAULT_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
const GFD_GOOGLE_LIVE_MODEL = 'models/gemini-3.1-flash-live-preview';
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

  it('does not expose GOOGLE_API_KEY when a websocket proxy is available', async () => {
    mockGetLLMConfig.mockReturnValueOnce({});
    mockApiKeyManagerPick.mockReturnValueOnce(null);
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        scoreDisplayLabel: SCORE_LABEL_GFD,
        systemPrompt: 'System prompt from DB',
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      apiKey?: string;
      geminiWsUrl?: string | null;
      liveAuthTokenUrl?: string | null;
    };
    expect(body.apiKey).toBeUndefined();
    expect(body.geminiWsUrl).toBe(PUBLIC_VOICE_PROXY_WS);
    expect(body.liveAuthTokenUrl).toBeUndefined();
  });

  it('returns scoreDisplayLabel and progress tool config from DB scenario', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        assistantLabel: 'Журналистка-расследователь',
        checkpointIds: ['VALUE', 'NEXT_STEP'],
        contextWindow: 5,
        enableCheckpoints: true,
        enableScoring: true,
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
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      liveModel?: string | null;
      roundEndingPrompt?: string | null;
      scoreDisplayLabel?: string | null;
      trainingProgressToolName?: string | null;
    };

    expect(body.liveModel).toBe(DEFAULT_LIVE_MODEL);
    expect(body.roundEndingPrompt).toBe(DEFAULT_TRAINING_ROUND_ENDING_PROMPT);
    expect(body.scoreDisplayLabel).toBe(SCORE_LABEL_GFD);
    expect(body.trainingProgressToolName).toBe('report_training_turn_progress');
  });

  it('returns default roundEndingPrompt when DB scenario has empty roundEndingPrompt', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        roundEndingPrompt: null,
        systemPrompt: 'System',
        title: 'T',
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { roundEndingPrompt?: string };
    expect(body.roundEndingPrompt).toBe(DEFAULT_TRAINING_ROUND_ENDING_PROMPT);
  });

  it('disables silence nudge phrases even if they are configured in the scenario', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        silenceNudgeAfterMs: 5000,
        silenceNudgeCooldownMs: 15000,
        silenceNudgePhrases: ['Алло?', 'Вы на связи?'],
        systemPrompt: 'System',
        title: 'T',
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      silenceNudgeAfterMs?: number;
      silenceNudgeCooldownMs?: number;
      silenceNudgePhrases?: string[];
    };
    expect(body.silenceNudgeAfterMs).toBe(0);
    expect(body.silenceNudgeCooldownMs).toBe(0);
    expect(body.silenceNudgePhrases).toEqual([]);
  });

  it('sanitizes planner and score tag instructions in voice system prompt', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        checkpointIds: ['VALUE'],
        contextWindow: 5,
        enableCheckpoints: true,
        enableScoring: true,
        goals: [],
        systemPrompt: [
          'Первая реплика: Представься как журналистка-блогер канала на VK Видео.',
          '',
          'Техническое требование: В САМЫЙ КОНЕЦ своей реплики добавляй служебные теги для UI.',
          'Пример: [weaknessCode: direct_answer_missing, responseMode: press_for_direct_answer]',
          'Пример: [CURRENT_SCORE: 12] [CHECKPOINT: VALUE]',
        ].join('\n'),
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      systemInstruction?: string | null;
      trainingProgressToolName?: string | null;
    };

    expect(body.systemInstruction).toContain('Представься как журналистка-блогер');
    expect(body.systemInstruction).not.toContain('[weaknessCode:');
    expect(body.systemInstruction).not.toContain('[responseMode:');
    expect(body.systemInstruction).not.toContain('[CURRENT_SCORE:');
    expect(body.systemInstruction).not.toContain('[CHECKPOINT:');
    expect(body.systemInstruction).not.toContain('служебные теги');
    expect(body.systemInstruction).toContain('Не добавляй в ответ служебные поля');
    expect(body.trainingProgressToolName).toBe('report_training_turn_progress');
  });

  it('returns Gemini 3.1 model for the dedicated Google Live trainer', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        systemPrompt: 'System prompt from DB',
        voiceName: 'Sulafat',
      },
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

  it('returns the direct public proxy websocket URL by default', async () => {
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        systemPrompt: 'System prompt from DB',
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      apiKey?: string;
      geminiWsUrl?: string | null;
      liveAuthTokenUrl?: string | null;
    };
    expect(body.apiKey).toBeUndefined();
    expect(body.geminiWsUrl).toBe(PUBLIC_VOICE_PROXY_WS);
    expect(body.liveAuthTokenUrl).toBeUndefined();
  });

  it('returns the app tunnel URL when explicitly enabled', async () => {
    vi.stubEnv('VOICE_CALL_WS_USE_TUNNEL', '1');
    mockGetTrainingScenarioWithKnowledge.mockResolvedValueOnce({
      knowledgeEntries: [],
      scenario: {
        contextWindow: 5,
        goals: [],
        systemPrompt: 'System prompt from DB',
        voiceName: 'Sulafat',
      },
    });

    const req = new Request(`http://localhost/api/voice-call/config?agentId=${GFD_KEY}`);
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      apiKey?: string;
      geminiWsUrl?: string | null;
      liveAuthTokenUrl?: string | null;
    };
    expect(body.apiKey).toBeUndefined();
    expect(body.geminiWsUrl).toBe('wss://doirp-ai.vercel.app/gemini-live-ws');
    expect(body.liveAuthTokenUrl).toBeUndefined();
  });
});

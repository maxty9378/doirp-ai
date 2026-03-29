import { afterEach, describe, expect, it, vi } from 'vitest';

import { getTrainingScenarioByKey, listTrainingScenarios } from './index';

const mockOrderBy = vi.fn();
const mockLimit = vi.fn();
const mockWhere = vi.fn();
const mockFrom = vi.fn();
const mockSelect = vi.fn((...args: any[]) => ({ from: mockFrom }));

vi.mock('@/database/server', () => ({
  serverDB: {
    select: (...args: any[]) => mockSelect(...args),
  },
}));

const baseScenario = {
  createdAt: new Date('2026-03-29T12:00:00.000Z'),
  description: 'Базовая версия стресс-интервью.',
  enableCheckpoints: true,
  enableScoring: true,
  id: 'trn_base_gfd',
  key: 'training-gfd-stress',
  scoreDisplayLabel: 'ЭФИРНЫЙ ПРЕССИНГ',
  scoreLevelLabels: { high: 'Высокий', low: 'Низкий', mid: 'Средний' },
  title: 'GFD: Стресс-интервью',
} as const;

describe('training scenario variants', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('inserts a dedicated Google Live scenario after the base GFD scenario', async () => {
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ orderBy: mockOrderBy });
    mockOrderBy.mockResolvedValueOnce([baseScenario]);

    const scenarios = await listTrainingScenarios();

    expect(scenarios).toHaveLength(2);
    expect(scenarios[0]).toMatchObject({
      key: 'training-gfd-stress',
      title: 'GFD: Стресс-интервью',
    });
    expect(scenarios[1]).toMatchObject({
      description:
        'Отдельная версия стресс-интервью на официальном Google Gemini Live API с live-расшифровкой речи.',
      enableCheckpoints: false,
      enableScoring: false,
      key: 'training-gfd-stress-google-live',
      scoreDisplayLabel: null,
      scoreLevelLabels: null,
      title: 'GFD: Google Live + расшифровка',
    });
    expect(scenarios[1]?.id).toBe(baseScenario.id);
  });

  it('resolves the dedicated Google Live key to the base scenario content but returns variant metadata', async () => {
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([baseScenario]);

    const scenario = await getTrainingScenarioByKey('training-gfd-stress-google-live');

    expect(scenario).toMatchObject({
      description:
        'Отдельная версия стресс-интервью на официальном Google Gemini Live API с live-расшифровкой речи.',
      enableCheckpoints: false,
      enableScoring: false,
      id: baseScenario.id,
      key: 'training-gfd-stress-google-live',
      title: 'GFD: Google Live + расшифровка',
    });
  });
});

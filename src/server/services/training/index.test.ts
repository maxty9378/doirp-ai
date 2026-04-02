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
  description: 'Р‘Р°Р·РѕРІР°СЏ РІРµСЂСЃРёСЏ СЃС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ.',
  enableCheckpoints: true,
  enableScoring: true,
  id: 'trn_base_gfd',
  key: 'training-gfd-stress',
  scoreDisplayLabel: 'Р Р•Р—РЈР›Р¬РўРђРў',
  scoreLevelLabels: { high: 'Р’С‹СЃРѕРєРёР№', low: 'РќРёР·РєРёР№', mid: 'РЎСЂРµРґРЅРёР№' },
  title: 'GFD: РЎС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ',
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
      title: 'GFD: РЎС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ',
    });
    expect(scenarios[1]).toMatchObject({
      description:
        'РћС‚РґРµР»СЊРЅР°СЏ РІРµСЂСЃРёСЏ СЃС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ РЅР° РѕС„РёС†РёР°Р»СЊРЅРѕРј Google Gemini Live API СЃ live-СЂР°СЃС€РёС„СЂРѕРІРєРѕР№ СЂРµС‡Рё.',
      enableCheckpoints: true,
      enableScoring: true,
      key: 'training-gfd-stress-google-live',
      scoreDisplayLabel: 'Р Р•Р—РЈР›Р¬РўРђРў',
      scoreLevelLabels: { high: 'Р’С‹СЃРѕРєРёР№', low: 'РќРёР·РєРёР№', mid: 'РЎСЂРµРґРЅРёР№' },
      title: 'GFD: Google Live + СЂР°СЃС€РёС„СЂРѕРІРєР°',
    });
    expect(scenarios[1]?.id).toBe(baseScenario.id);
  });

  it('prefers the exact scenario from DB if it exists (allows user customization)', async () => {
    const customGoogleLiveScenario = {
      ...baseScenario,
      id: 'trn_custom_google_live',
      key: 'training-gfd-stress-google-live',
      legend: 'Custom Legend for Google Live',
      title: 'Custom GFD: Google Live',
    } as const;

    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([customGoogleLiveScenario]);

    const scenario = await getTrainingScenarioByKey('training-gfd-stress-google-live');

    expect(scenario).toMatchObject({
      id: 'trn_custom_google_live',
      key: 'training-gfd-stress-google-live',
      legend: 'Custom Legend for Google Live',
      title: 'Custom GFD: Google Live',
    });
  });

  it('resolves the dedicated Google Live key to the base scenario content but returns variant metadata', async () => {
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);

    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([baseScenario]);

    const scenario = await getTrainingScenarioByKey('training-gfd-stress-google-live');

    expect(scenario).toMatchObject({
      description:
        'РћС‚РґРµР»СЊРЅР°СЏ РІРµСЂСЃРёСЏ СЃС‚СЂРµСЃСЃ-РёРЅС‚РµСЂРІСЊСЋ РЅР° РѕС„РёС†РёР°Р»СЊРЅРѕРј Google Gemini Live API СЃ live-СЂР°СЃС€РёС„СЂРѕРІРєРѕР№ СЂРµС‡Рё.',
      enableCheckpoints: true,
      enableScoring: true,
      id: baseScenario.id,
      key: 'training-gfd-stress-google-live',
      scoreDisplayLabel: 'Р Р•Р—РЈР›Р¬РўРђРў',
      scoreLevelLabels: { high: 'Р’С‹СЃРѕРєРёР№', low: 'РќРёР·РєРёР№', mid: 'РЎСЂРµРґРЅРёР№' },
      title: 'GFD: Google Live + СЂР°СЃС€РёС„СЂРѕРІРєР°',
    });
  });

  it('does not resolve unrelated trainer keys to the base GFD scenario', async () => {
    mockFrom.mockReturnValueOnce({ where: mockWhere });
    mockWhere.mockReturnValueOnce({ limit: mockLimit });
    mockLimit.mockResolvedValueOnce([]);

    const scenario = await getTrainingScenarioByKey('training-tp-price-objection');

    expect(scenario).toBeNull();
  });
});

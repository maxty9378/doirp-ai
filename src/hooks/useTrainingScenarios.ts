'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import type { TrainingScenarioFromApi } from '@/app/[variants]/(main)/home/features/TrainingAgents/TrainingScenarioCard';

const STORAGE_KEY = 'training-scenarios-cache:v1';
const CACHE_TTL = 10 * 60 * 1000;

interface TrainingScenariosCache {
  scenarios: TrainingScenarioFromApi[];
  timestamp: number;
}

const isBrowser = () => typeof window !== 'undefined';

const normalizeTrainingScenario = (scenario: Partial<TrainingScenarioFromApi>): TrainingScenarioFromApi => ({
  avatarUrl: typeof scenario.avatarUrl === 'string' ? scenario.avatarUrl : null,
  bannerUrl: typeof scenario.bannerUrl === 'string' ? scenario.bannerUrl : null,
  description: typeof scenario.description === 'string' ? scenario.description : null,
  key: typeof scenario.key === 'string' ? scenario.key : '',
  title: typeof scenario.title === 'string' ? scenario.title : '',
});

const isValidTrainingScenario = (
  scenario: Partial<TrainingScenarioFromApi>,
): scenario is TrainingScenarioFromApi =>
  typeof scenario.key === 'string' &&
  scenario.key.length > 0 &&
  typeof scenario.title === 'string' &&
  scenario.title.length > 0;

const preloadImage = (url?: string | null) => {
  if (!isBrowser() || !url) return;

  const image = new Image();
  image.src = url;
};

const preloadScenarioAssets = (scenarios: TrainingScenarioFromApi[]) => {
  scenarios.forEach((scenario) => {
    preloadImage(scenario.bannerUrl);
    preloadImage(scenario.avatarUrl);
  });
};

const readCache = (): TrainingScenarioFromApi[] | null => {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as TrainingScenariosCache;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!Array.isArray(parsed.scenarios)) return null;
    if (typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;

    const scenarios = parsed.scenarios
      .map(normalizeTrainingScenario)
      .filter(isValidTrainingScenario);

    return scenarios.length > 0 ? scenarios : null;
  } catch {
    return null;
  }
};

const writeCache = (scenarios: TrainingScenarioFromApi[]) => {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ scenarios, timestamp: Date.now() } satisfies TrainingScenariosCache),
    );
  } catch {
    // ignore storage failures
  }
};

export const useTrainingScenarios = () => {
  const [scenarios, setScenarios] = useState<TrainingScenarioFromApi[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasCachedDataRef = useRef(false);

  useLayoutEffect(() => {
    const cachedScenarios = readCache();
    if (!cachedScenarios) return;

    hasCachedDataRef.current = true;
    setScenarios(cachedScenarios);
    setIsLoading(false);
    preloadScenarioAssets(cachedScenarios);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    const fetchScenarios = async () => {
      if (!hasCachedDataRef.current) {
        setIsLoading(true);
      }

      try {
        const res = await fetch('/api/training/scenarios', {
          credentials: 'include',
          signal: controller.signal,
        });

        if (!res.ok) throw new Error(`Failed to load scenarios: ${res.status}`);

        const data = (await res.json()) as { scenarios?: Partial<TrainingScenarioFromApi>[] };
        const nextScenarios = Array.isArray(data?.scenarios)
          ? data.scenarios.map(normalizeTrainingScenario).filter(isValidTrainingScenario)
          : [];

        if (controller.signal.aborted) return;

        setScenarios(nextScenarios);
        writeCache(nextScenarios);
        preloadScenarioAssets(nextScenarios);
      } catch {
        if (controller.signal.aborted) return;
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    void fetchScenarios();

    return () => {
      controller.abort();
    };
  }, []);

  return { isLoading, scenarios };
};

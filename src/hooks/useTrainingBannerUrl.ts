'use client';

import { useEffect, useLayoutEffect, useState } from 'react';

import {
  TRAINING_HN_BANNER_URL,
  TRAINING_TP_BANNER_URL,
} from '@/config/voiceCallTrainer';

const EVENT_NAME = 'training-banner-updated';
const STORAGE_KEY_PREFIX = 'training-banner-cache:';
const CACHE_TTL = 10 * 60 * 1000;

export type TrainingBannerKey = 'tp' | 'hn';

const DEFAULT_URL_BY_KEY: Record<TrainingBannerKey, string> = {
  hn: TRAINING_HN_BANNER_URL,
  tp: TRAINING_TP_BANNER_URL,
};

interface BannerUpdateEventDetail {
  key?: TrainingBannerKey;
  url?: string;
}

interface BannerCacheEntry {
  timestamp: number;
  url: string;
}

const isBrowser = () => typeof window !== 'undefined';

const getStorageKey = (key: TrainingBannerKey) => `${STORAGE_KEY_PREFIX}${key}`;

const readBannerCache = (key: TrainingBannerKey): string | null => {
  if (!isBrowser()) return null;

  try {
    const raw = window.localStorage.getItem(getStorageKey(key));
    if (!raw) return null;

    const parsed = JSON.parse(raw) as BannerCacheEntry;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.url !== 'string' || parsed.url.trim().length === 0) return null;
    if (typeof parsed.timestamp !== 'number') return null;
    if (Date.now() - parsed.timestamp > CACHE_TTL) return null;

    return parsed.url.trim();
  } catch {
    return null;
  }
};

const writeBannerCache = (key: TrainingBannerKey, url: string) => {
  if (!isBrowser()) return;

  try {
    window.localStorage.setItem(
      getStorageKey(key),
      JSON.stringify({ timestamp: Date.now(), url } satisfies BannerCacheEntry),
    );
  } catch {
    // ignore storage failures
  }
};

export const useTrainingBannerUrl = (key: TrainingBannerKey = 'tp') => {
  const [bannerUrl, setBannerUrl] = useState(DEFAULT_URL_BY_KEY[key]);

  useLayoutEffect(() => {
    const cachedBannerUrl = readBannerCache(key);
    if (!cachedBannerUrl) return;

    setBannerUrl(cachedBannerUrl);
  }, [key]);

  useEffect(() => {
    let mounted = true;

    const fetchBannerUrl = async () => {
      try {
        const res = await fetch(`/api/training/banner?key=${key}`);
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string };
        if (mounted && typeof data.url === 'string' && data.url.trim().length > 0) {
          const nextUrl = data.url.trim();
          setBannerUrl(nextUrl);
          writeBannerCache(key, nextUrl);
        }
      } catch {
        // keep fallback URL silently
      }
    };

    const handleBannerUpdate = (event: Event) => {
      const customEvent = event as CustomEvent<BannerUpdateEventDetail>;
      const detailKey = customEvent.detail?.key;
      if (detailKey !== key) return;
      const nextUrl = customEvent.detail?.url;
      if (typeof nextUrl === 'string' && nextUrl.trim().length > 0) {
        const normalizedUrl = nextUrl.trim();
        setBannerUrl(normalizedUrl);
        writeBannerCache(key, normalizedUrl);
      }
    };

    void fetchBannerUrl();
    window.addEventListener(EVENT_NAME, handleBannerUpdate);

    return () => {
      mounted = false;
      window.removeEventListener(EVENT_NAME, handleBannerUpdate);
    };
  }, [key]);

  return bannerUrl;
};

export const emitTrainingBannerUpdated = (url: string, key: TrainingBannerKey = 'tp') => {
  if (!isBrowser()) return;
  writeBannerCache(key, url);
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key, url } }));
};

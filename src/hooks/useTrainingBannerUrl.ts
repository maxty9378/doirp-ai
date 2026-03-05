'use client';

import { useEffect, useState } from 'react';

import {
  TRAINING_HN_BANNER_URL,
  TRAINING_TP_BANNER_URL,
} from '@/config/voiceCallTrainer';

const EVENT_NAME = 'training-banner-updated';

export type TrainingBannerKey = 'tp' | 'hn';

const DEFAULT_URL_BY_KEY: Record<TrainingBannerKey, string> = {
  hn: TRAINING_HN_BANNER_URL,
  tp: TRAINING_TP_BANNER_URL,
};

interface BannerUpdateEventDetail {
  key?: TrainingBannerKey;
  url?: string;
}

export const useTrainingBannerUrl = (key: TrainingBannerKey = 'tp') => {
  const [bannerUrl, setBannerUrl] = useState(DEFAULT_URL_BY_KEY[key]);

  useEffect(() => {
    let mounted = true;

    const fetchBannerUrl = async () => {
      try {
        const res = await fetch(`/api/training/banner?key=${key}`, { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { url?: string };
        if (mounted && typeof data.url === 'string' && data.url.trim().length > 0) {
          setBannerUrl(data.url.trim());
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
        setBannerUrl(nextUrl.trim());
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
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { key, url } }));
};

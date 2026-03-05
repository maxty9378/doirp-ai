'use client';

import { useEffect, useState } from 'react';

import { TRAINING_TP_BANNER_URL } from '@/config/voiceCallTrainer';

const EVENT_NAME = 'training-banner-updated';

interface BannerUpdateEventDetail {
  url?: string;
}

export const useTrainingBannerUrl = () => {
  const [bannerUrl, setBannerUrl] = useState(TRAINING_TP_BANNER_URL);

  useEffect(() => {
    let mounted = true;

    const fetchBannerUrl = async () => {
      try {
        const res = await fetch('/api/training/banner', { cache: 'no-store' });
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
  }, []);

  return bannerUrl;
};

export const emitTrainingBannerUpdated = (url: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { url } }));
};

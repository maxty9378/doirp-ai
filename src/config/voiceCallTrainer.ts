const DEFAULT_TRAINING_TP_BANNER_URL = '/images/voice-call/trainer-banner-current.png';

export const TRAINING_TP_BANNER_URL =
  process.env.NEXT_PUBLIC_TRAINING_TP_BANNER_URL?.trim() || DEFAULT_TRAINING_TP_BANNER_URL;

/** Плейсхолдер, пока обложка не загружена — стандартная иконка «картинка» */
const TRAINER_BANNER_PLACEHOLDER = '/images/voice-call/trainer-banner-placeholder.svg';
const DEFAULT_TRAINING_TP_BANNER_URL = TRAINER_BANNER_PLACEHOLDER;
const DEFAULT_TRAINING_HN_BANNER_URL = TRAINER_BANNER_PLACEHOLDER;

export const TRAINING_TP_BANNER_URL =
  process.env.NEXT_PUBLIC_TRAINING_TP_BANNER_URL?.trim() || DEFAULT_TRAINING_TP_BANNER_URL;

export const TRAINING_HN_BANNER_URL =
  process.env.NEXT_PUBLIC_TRAINING_HN_BANNER_URL?.trim() || DEFAULT_TRAINING_HN_BANNER_URL;

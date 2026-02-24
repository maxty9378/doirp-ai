import { DEFAULT_LANG } from '@/const/locale';

import type resources from './default';

export const locales = ['ru-RU'] as const;

export type DefaultResources = typeof resources;
export type NS = keyof DefaultResources;

/** Все локали, поддерживаемые в типах (тесты и сервер). В UI по умолчанию только ru-RU. */
export type Locales =
  | 'ar'
  | 'bg-BG'
  | 'de-DE'
  | 'en-US'
  | 'es-ES'
  | 'fa-IR'
  | 'fr-FR'
  | 'it-IT'
  | 'ja-JP'
  | 'ko-KR'
  | 'nl-NL'
  | 'pl-PL'
  | 'pt-BR'
  | 'ru-RU'
  | 'tr-TR'
  | 'vi-VN'
  | 'zh-CN'
  | 'zh-TW';

export const normalizeLocale = (locale?: string): Locales => {
  if (!locale) return DEFAULT_LANG;
  if (locale.startsWith('ru')) return 'ru-RU';
  return DEFAULT_LANG;
};

type LocaleOptions = {
  label: string;
  value: Locales;
}[];

export const localeOptions: LocaleOptions = [
  {
    label: 'Русский',
    value: 'ru-RU',
  },
] as LocaleOptions;

export const supportLocales: string[] = ['ru-RU', 'ru'];

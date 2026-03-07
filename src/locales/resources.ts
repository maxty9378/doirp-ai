import { DEFAULT_LANG } from '@/const/locale';

import type resources from './default';

export const locales = ['ru-RU'] as const;

export type DefaultResources = typeof resources;
export type NS = keyof DefaultResources;

/** Единственная поддерживаемая локаль для корпоративного использования. */
export type Locales = 'ru-RU';

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

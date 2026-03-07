import { resolveAcceptLanguage } from 'resolve-accept-language';

import { DEFAULT_LANG } from '@/const/locale';
import { type Locales } from '@/locales/resources';
import { locales, normalizeLocale } from '@/locales/resources';

import { RouteVariants } from './server/routeVariants';

export const getAntdLocale = async (lang?: string) => {
  const normalLang = normalizeLocale(lang);
  // antd: ru_RU для ru-RU
  const antdLocaleKey = normalLang.replace('-', '_');
  const { default: locale } = await import(`antd/locale/${antdLocaleKey}.js`);

  return locale;
};

/**
 * Parse the browser language and return the fallback language
 */
export const parseBrowserLanguage = (headers: Headers, defaultLang: string = DEFAULT_LANG) => {
  // if the default language is not 'en-US', just return the default language as fallback lang
  if (defaultLang !== 'en-US') return defaultLang;

  /**
   * The arguments are as follows:
   *
   * 1) The HTTP accept-language header.
   * 2) The available locales (they must contain the default locale).
   * 3) The default locale.
   */
  const availableLocales = [...locales];
  const defaultLocale: string = availableLocales.includes(defaultLang as any)
    ? defaultLang
    : availableLocales[0];
  let browserLang: string = resolveAcceptLanguage(
    headers.get('accept-language') || '',
    availableLocales,
    defaultLocale as any,
  );

  // if match the ar-EG then fallback to ar
  if (browserLang === 'ar-EG') browserLang = 'ar';

  return browserLang as Locales;
};

/**
 * Parse the page locale from the URL and search
 * used in cloud
 */
export const parsePageLocale = async (props: {
  params: Promise<{ variants: string }>;
  searchParams: Promise<any>;
}) => {
  const searchParams = await props.searchParams;

  const browserLocale = await RouteVariants.getLocale(props);
  return normalizeLocale(searchParams?.hl || browserLocale) as Locales;
};

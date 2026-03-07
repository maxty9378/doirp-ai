import { DEFAULT_LANG } from '@/const/locale';
import { normalizeLocale } from '@/locales/resources';

type UILocaleResources = Record<string, Record<string, string>>;

const loadBusinessResources = async (locale: string): Promise<UILocaleResources | null> => {
  try {
    const resourcesModule = await import(`@/../locales/${locale}/ui.json`);
    return resourcesModule.default as UILocaleResources;
  } catch {
    return null;
  }
};

const loadLobeUIBuiltinResources = async (locale: string): Promise<UILocaleResources | null> => {
  try {
    const { en } = await import('@lobehub/ui/es/i18n/resources/index');
    return en as UILocaleResources;
  } catch {
    return null;
  }
};

export const getUILocaleAndResources = async (
  locale: string | 'auto',
): Promise<{ locale: string; resources: UILocaleResources }> => {
  const effectiveLocale = locale === 'auto' ? DEFAULT_LANG : locale;
  const normalizedLocale = normalizeLocale(effectiveLocale);

  const resources =
    (await loadBusinessResources(normalizedLocale)) ??
    (await loadBusinessResources(DEFAULT_LANG)) ??
    (await loadLobeUIBuiltinResources('en'));

  if (!resources)
    throw new Error(
      `Failed to load UI resources for locale=${normalizedLocale}`,
    );

  return {
    locale: normalizedLocale,
    resources,
  };
};

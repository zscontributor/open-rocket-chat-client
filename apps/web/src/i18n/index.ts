import i18next from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import { LOCALES, NAMESPACES, resources, type LocaleCode } from './resources';

export { LOCALES, NAMESPACES, resources } from './resources';
export type { LocaleCode } from './resources';

/**
 * English is the source of truth: every other locale is measured against it,
 * and a key missing from a translation falls back to English rather than
 * rendering the raw key at the user.
 */
export const FALLBACK_LOCALE: LocaleCode = 'en';

export const initI18n = async (): Promise<typeof i18next> => {
  await i18next
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources,
      fallbackLng: FALLBACK_LOCALE,
      supportedLngs: LOCALES.map((locale) => locale.code),
      // `vi-VN` and `vi` should resolve to the same bundle.
      nonExplicitSupportedLngs: true,
      ns: NAMESPACES,
      defaultNS: 'common',
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: 'orc:locale',
        caches: ['localStorage'],
      },
      interpolation: {
        // React escapes for us; double-escaping mangles names containing `&`.
        escapeValue: false,
      },
      returnNull: false,
    });

  return i18next;
};

export const changeLocale = async (code: LocaleCode): Promise<void> => {
  await i18next.changeLanguage(code);
  document.documentElement.lang = code;
};

export { i18next };

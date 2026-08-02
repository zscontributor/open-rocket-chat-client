import type { resources } from './resources';

/**
 * Makes translation keys type-checked against the English bundle.
 *
 * A typo in `t('rooms:info.tittle')` becomes a compile error rather than a
 * string that silently renders as the key in production.
 */
declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'common';
    resources: (typeof resources)['en'];
    returnNull: false;
  }
}

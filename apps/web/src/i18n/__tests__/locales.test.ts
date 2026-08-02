import { describe, expect, it } from 'vitest';

import { LOCALES, NAMESPACES, resources } from '../resources';

type Bundle = Record<string, unknown>;

/** `{ a: { b: 'x' } }` -> `['a.b']`, so two bundles can be compared as sets. */
const flatten = (value: Bundle, prefix = ''): Record<string, string> => {
  const flat: Record<string, string> = {};

  for (const [key, entry] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      Object.assign(flat, flatten(entry as Bundle, path));
    } else {
      flat[path] = String(entry);
    }
  }

  return flat;
};

const placeholdersIn = (value: string): string[] =>
  [...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map((match) => match[1] as string).sort();

/**
 * i18next resolves `key_one` / `key_other` from a base key, and the set of
 * plural categories a language needs is not the same everywhere: English has
 * two, Vietnamese has one. Comparing raw keys would demand that Vietnamese
 * carry a suffix its grammar has no use for.
 */
const PLURAL_SUFFIX = /_(zero|one|two|few|many|other)$/;
const baseKey = (key: string): string => key.replace(PLURAL_SUFFIX, '');

const englishKeys = (namespace: string): Record<string, string> =>
  flatten(resources.en[namespace as keyof typeof resources.en] as Bundle);

const translatedLocales = LOCALES.filter((locale) => locale.code !== 'en');

describe('locale registration', () => {
  it('declares a bundle for every registered locale', () => {
    for (const locale of LOCALES) {
      expect(resources[locale.code], `no bundle for "${locale.code}"`).toBeDefined();
    }
  });

  it('gives every locale all namespaces', () => {
    for (const locale of LOCALES) {
      expect(Object.keys(resources[locale.code]).sort()).toEqual([...NAMESPACES].sort());
    }
  });

  it('names each language in that language, for the language picker', () => {
    for (const locale of LOCALES) {
      expect(locale.name.length).toBeGreaterThan(0);
      expect(locale.englishName.length).toBeGreaterThan(0);
    }
  });
});

describe.each(translatedLocales)('$englishName ($code)', (locale) => {
  describe.each(NAMESPACES)('%s', (namespace) => {
    const english = englishKeys(namespace);
    const translated = flatten(resources[locale.code][namespace] as Bundle);

    const englishBases = new Set(Object.keys(english).map(baseKey));
    const translatedBases = new Set(Object.keys(translated).map(baseKey));

    it('translates every English key', () => {
      const missing = [...englishBases].filter((key) => !translatedBases.has(key));
      expect(missing, `missing in ${locale.code}/${namespace}.json`).toEqual([]);
    });

    it('has no keys English does not', () => {
      // A stale key is usually a rename that was not carried across, and it
      // would sit unused and untranslated forever.
      const extra = [...translatedBases].filter((key) => !englishBases.has(key));
      expect(extra, `not present in en/${namespace}.json`).toEqual([]);
    });

    it('keeps the same interpolation placeholders', () => {
      const mismatches: string[] = [];

      for (const [key, value] of Object.entries(english)) {
        const expected = placeholdersIn(value);
        if (expected.length === 0) continue;

        // Compare against the matching plural form, or the base key.
        const candidate = translated[key] ?? translated[baseKey(key)];
        if (candidate === undefined) continue;

        const actual = placeholdersIn(candidate);
        if (actual.join(',') !== expected.join(',')) {
          mismatches.push(
            `${key}: expected {{${expected.join('}}, {{')}}}, got ${actual.length ? `{{${actual.join('}}, {{')}}}` : 'none'}`,
          );
        }
      }

      expect(mismatches, `placeholder drift in ${locale.code}/${namespace}.json`).toEqual([]);
    });

    it('leaves no value empty', () => {
      const empty = Object.entries(translated)
        .filter(([, value]) => value.trim().length === 0)
        .map(([key]) => key);

      expect(empty).toEqual([]);
    });
  });
});

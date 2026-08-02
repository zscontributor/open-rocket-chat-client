import type { Theme, ThemeTokens, ThemeVariant } from './contract.js';

/**
 * Prefix for every generated custom property. Namespaced so a theme cannot
 * collide with variables from an embedding page.
 */
const PREFIX = '--orc';

/**
 * Flattens tokens into CSS custom properties.
 *
 * `{ surface: { app: '#fff' } }` becomes `--orc-surface-app: #fff`. Tailwind's
 * `@theme` block in `styles.css` reads these, so swapping a theme is one pass
 * of `setProperty` rather than a re-render or a stylesheet reload.
 */
export const toCssVariables = (tokens: ThemeTokens): Record<string, string> => {
  const variables: Record<string, string> = {};

  for (const [group, values] of Object.entries(tokens)) {
    for (const [name, value] of Object.entries(values as Record<string, string>)) {
      variables[`${PREFIX}-${group}-${kebab(name)}`] = value;
    }
  }

  return variables;
};

/** Emits the variables as a CSS rule, for server rendering or a `<style>` tag. */
export const toCssText = (tokens: ThemeTokens, selector = ':root'): string => {
  const body = Object.entries(toCssVariables(tokens))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');

  return `${selector} {\n${body}\n}`;
};

export interface ApplyThemeOptions {
  /** Defaults to `document.documentElement`. */
  target?: HTMLElement;
}

/** Writes a variant's tokens onto the document and sets `color-scheme`. */
export const applyThemeVariant = (variant: ThemeVariant, options: ApplyThemeOptions = {}): void => {
  const target = options.target ?? document.documentElement;

  for (const [name, value] of Object.entries(toCssVariables(variant.tokens))) {
    target.style.setProperty(name, value);
  }

  // Drives native scrollbars, form controls and the default canvas colour.
  target.style.colorScheme = variant.colorScheme;
  // Kept as an attribute so CSS can still branch on the mode where a media
  // query would be wrong — the user may have overridden their OS preference.
  target.dataset.colorScheme = variant.colorScheme;
};

export type ColorSchemePreference = 'light' | 'dark' | 'system';

/** Resolves `system` against the OS setting. */
export const resolveColorScheme = (preference: ColorSchemePreference): 'light' | 'dark' => {
  if (preference !== 'system') return preference;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

export const applyTheme = (
  theme: Theme,
  preference: ColorSchemePreference,
  options: ApplyThemeOptions = {},
): 'light' | 'dark' => {
  const scheme = resolveColorScheme(preference);
  applyThemeVariant(theme[scheme], options);

  const target = options.target ?? document.documentElement;
  target.dataset.theme = theme.id;

  return scheme;
};

const kebab = (value: string): string => value.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`);

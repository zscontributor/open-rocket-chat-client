export {
  ThemeSchema,
  ThemeTokensSchema,
  ThemeVariantSchema,
  InvalidThemeError,
  parseTheme,
  extendTheme,
} from './contract.js';
export type { Theme, ThemeTokens, ThemeVariant } from './contract.js';

export { applyTheme, applyThemeVariant, toCssText, toCssVariables, resolveColorScheme } from './apply.js';
export type { ApplyThemeOptions, ColorSchemePreference } from './apply.js';

export { ThemeRegistry, createThemeRegistry, builtInThemes } from './registry.js';

export { defaultTheme } from './themes/default.js';
export { nordSlateTheme } from './themes/nord-slate.js';

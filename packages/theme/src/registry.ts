import { parseTheme, type Theme } from './contract.js';
import { defaultTheme } from './themes/default.js';
import { nordSlateTheme } from './themes/nord-slate.js';

/**
 * The set of themes the running app can offer.
 *
 * Registration validates, so a broken third-party theme is rejected at the
 * point it is added — with the offending token names in the message — instead
 * of half-applying and leaving the UI unreadable.
 */
export class ThemeRegistry {
  private readonly themes = new Map<string, Theme>();

  constructor(initial: Theme[] = []) {
    for (const theme of initial) this.register(theme);
  }

  /** Validates and adds a theme. Re-registering an id replaces it. */
  register(candidate: unknown): Theme {
    const theme = parseTheme(candidate);
    this.themes.set(theme.id, theme);
    return theme;
  }

  registerAll(candidates: unknown[]): Theme[] {
    return candidates.map((candidate) => this.register(candidate));
  }

  get(id: string): Theme | undefined {
    return this.themes.get(id);
  }

  /**
   * Falls back to the default theme rather than throwing: a stored preference
   * can outlive the theme it names, and being unable to render is a far worse
   * outcome than rendering in the wrong colours.
   */
  resolve(id: string | undefined): Theme {
    return (id ? this.themes.get(id) : undefined) ?? defaultTheme;
  }

  list(): Theme[] {
    return [...this.themes.values()].sort((left, right) => {
      // The default sorts first; everything else alphabetically.
      if (left.id === defaultTheme.id) return -1;
      if (right.id === defaultTheme.id) return 1;
      return left.name.localeCompare(right.name);
    });
  }

  has(id: string): boolean {
    return this.themes.has(id);
  }
}

/** Themes bundled with the app. */
export const builtInThemes: Theme[] = [defaultTheme, nordSlateTheme];

export const createThemeRegistry = (extra: Theme[] = []): ThemeRegistry =>
  new ThemeRegistry([...builtInThemes, ...extra]);

import { applyTheme, createThemeRegistry, type ColorSchemePreference, type Theme } from '@open-rocket-chat/theme';
import { create } from 'zustand';

const THEME_KEY = 'orc:theme';
const SCHEME_KEY = 'orc:color-scheme';

/**
 * Built-in themes plus anything registered at startup.
 *
 * A deployment can add its own by importing this registry and calling
 * `register()` before the app mounts — see `docs/theming.md`.
 */
export const themeRegistry = createThemeRegistry();

interface ThemeState {
  themeId: string;
  /** `system` follows the OS; the other two are explicit user choices. */
  preference: ColorSchemePreference;
  /** What `preference` currently resolves to. */
  resolvedScheme: 'light' | 'dark';

  setTheme: (themeId: string) => void;
  setPreference: (preference: ColorSchemePreference) => void;
  cycleScheme: () => void;
  /** Re-applies the active theme; called on mount and when the OS setting flips. */
  apply: () => void;
  availableThemes: () => Theme[];
}

const readStored = <T extends string>(key: string, allowed: readonly T[], fallback: T): T => {
  const stored = localStorage.getItem(key);
  return allowed.includes(stored as T) ? (stored as T) : fallback;
};

const SCHEMES = ['light', 'dark', 'system'] as const;

export const useThemeStore = create<ThemeState>((set, get) => ({
  // An uninstalled theme id resolves back to the default rather than throwing.
  themeId: themeRegistry.resolve(localStorage.getItem(THEME_KEY) ?? undefined).id,
  preference: readStored(SCHEME_KEY, SCHEMES, 'system'),
  resolvedScheme: 'light',

  setTheme: (themeId) => {
    localStorage.setItem(THEME_KEY, themeId);
    set({ themeId });
    get().apply();
  },

  setPreference: (preference) => {
    localStorage.setItem(SCHEME_KEY, preference);
    set({ preference });
    get().apply();
  },

  cycleScheme: () => {
    const order: ColorSchemePreference[] = ['system', 'light', 'dark'];
    const next = order[(order.indexOf(get().preference) + 1) % order.length] as ColorSchemePreference;
    get().setPreference(next);
  },

  apply: () => {
    const { themeId, preference } = get();
    const resolvedScheme = applyTheme(themeRegistry.resolve(themeId), preference);
    set({ resolvedScheme });
  },

  availableThemes: () => themeRegistry.list(),
}));

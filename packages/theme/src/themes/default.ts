import { parseTheme, type Theme } from '../contract.js';

/**
 * The theme shipped out of the box: warm neutrals with an amber accent.
 *
 * Use this as the starting point for a community theme — `extendTheme` lets you
 * override a handful of tokens without restating the rest.
 */
export const defaultTheme: Theme = parseTheme({
  id: 'default',
  name: 'Default',
  description: 'Warm neutrals with an amber accent.',
  author: 'Open Rocket.Chat',

  light: {
    colorScheme: 'light',
    tokens: {
      surface: {
        app: '#ffffff',
        sidebar: '#fbf9f7',
        panel: '#ffffff',
        raised: '#f6f3ef',
        sunken: '#f1ede8',
        overlay: 'rgb(28 22 16 / 0.55)',
        selected: '#b4691f',
        highlight: '#fbf6ef',
      },
      content: {
        primary: '#221d18',
        secondary: '#4a423b',
        muted: '#8a8078',
        inverted: '#ffffff',
        link: '#b4691f',
      },
      border: {
        subtle: '#ece6df',
        strong: '#dcd3c9',
        focus: '#c2762b',
      },
      accent: {
        base: '#c2762b',
        hover: '#a9651f',
        content: '#ffffff',
        subtle: '#f7ead9',
      },
      status: {
        online: '#22a06b',
        away: '#e5a00d',
        busy: '#e5493a',
        offline: '#a8a29a',
        danger: '#d64545',
        warning: '#e5a00d',
        success: '#22a06b',
        info: '#3b82f6',
      },
      radius: { sm: '6px', md: '10px', lg: '14px', xl: '20px' },
      shadow: {
        sm: '0 1px 2px rgb(28 22 16 / 0.06)',
        md: '0 4px 12px rgb(28 22 16 / 0.08)',
        lg: '0 16px 40px rgb(28 22 16 / 0.16)',
      },
      font: {
        sans: "'Inter var', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
      },
    },
  },

  dark: {
    colorScheme: 'dark',
    tokens: {
      surface: {
        app: '#1c1815',
        sidebar: '#17130f',
        panel: '#1c1815',
        raised: '#241f1a',
        sunken: '#14100d',
        overlay: 'rgb(0 0 0 / 0.65)',
        selected: '#b4691f',
        highlight: '#241c12',
      },
      content: {
        primary: '#f2ede7',
        secondary: '#c9c1b8',
        muted: '#948b82',
        inverted: '#ffffff',
        link: '#e0a063',
      },
      border: {
        subtle: '#2e2721',
        strong: '#443a31',
        focus: '#e0a063',
      },
      accent: {
        base: '#d5893d',
        hover: '#e29a52',
        // Dark text on a light amber button: white would fail contrast here.
        content: '#1c1815',
        subtle: '#33261a',
      },
      status: {
        online: '#3cc98a',
        away: '#f0b429',
        busy: '#f2695c',
        offline: '#6f675f',
        danger: '#f2695c',
        warning: '#f0b429',
        success: '#3cc98a',
        info: '#60a5fa',
      },
      radius: { sm: '6px', md: '10px', lg: '14px', xl: '20px' },
      shadow: {
        sm: '0 1px 2px rgb(0 0 0 / 0.4)',
        md: '0 4px 12px rgb(0 0 0 / 0.45)',
        lg: '0 16px 40px rgb(0 0 0 / 0.6)',
      },
      font: {
        sans: "'Inter var', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif",
        mono: "ui-monospace, 'SF Mono', 'JetBrains Mono', Menlo, monospace",
      },
    },
  },
});

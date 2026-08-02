import { extendTheme } from '../contract.js';
import { defaultTheme } from './default.js';

/**
 * A worked example of a community theme.
 *
 * It changes twenty-odd tokens and inherits the rest, which is the pattern most
 * themes should follow: `extendTheme` keeps them working when the contract
 * gains tokens, whereas a hand-copied theme would fail validation on upgrade.
 */
export const nordSlateTheme = extendTheme(defaultTheme, {
  id: 'nord-slate',
  name: 'Nord Slate',
  description: 'Cool blue-greys with a muted indigo accent.',
  author: 'Open Rocket.Chat',

  light: {
    surface: {
      app: '#ffffff',
      sidebar: '#f6f8fb',
      panel: '#ffffff',
      raised: '#eef2f7',
      sunken: '#e7edf4',
      selected: '#4c6ef5',
      highlight: '#f2f5fd',
    },
    content: {
      primary: '#1b2430',
      secondary: '#3d4a5c',
      muted: '#78859a',
      link: '#4c6ef5',
    },
    border: { subtle: '#e3e9f1', strong: '#cdd7e4', focus: '#4c6ef5' },
    accent: { base: '#4c6ef5', hover: '#3b5bdb', content: '#ffffff', subtle: '#e2e8fd' },
  },

  dark: {
    surface: {
      app: '#161b22',
      sidebar: '#12161c',
      panel: '#161b22',
      raised: '#1d232c',
      sunken: '#0e1217',
      selected: '#4c6ef5',
      highlight: '#182034',
    },
    content: {
      primary: '#e6edf5',
      secondary: '#bcc7d6',
      muted: '#7d8798',
      link: '#8ba4ff',
    },
    border: { subtle: '#252c36', strong: '#39434f', focus: '#8ba4ff' },
    accent: { base: '#748ffc', hover: '#91a7ff', content: '#12161c', subtle: '#20293d' },
  },
});

# Theming

Every colour, radius, shadow and font in the app comes from the active theme. No component hard-codes a colour, which is what makes a community theme able to change the whole look without touching a single component.

## How it works

A theme is a plain object of tokens. At runtime it is flattened into CSS custom properties on `<html>`:

```
{ surface: { app: '#ffffff' } }   →   --orc-surface-app: #ffffff
```

Tailwind maps those variables to utilities in `apps/web/src/styles.css`, so `bg-app` resolves to whatever the current theme says `surface.app` is. Switching theme is one pass of `setProperty` — no stylesheet reload, no re-render, no flash.

## Writing a theme

Start from the default and override what you need. `extendTheme` fills in the rest, which also means your theme keeps working when the contract gains a token — a hand-copied theme would fail validation on upgrade.

```ts
import { extendTheme, defaultTheme } from '@open-rocket-chat/theme';

export const acmeTheme = extendTheme(defaultTheme, {
  id: 'acme',
  name: 'Acme',
  description: 'Acme brand colours.',
  author: 'Acme Corp',

  light: {
    accent: { base: '#0f6f4c', hover: '#0b5b3e', content: '#ffffff', subtle: '#e2f3ec' },
    surface: { sidebar: '#f5faf8', selected: '#0f6f4c' },
  },

  dark: {
    accent: { base: '#4fbe93', hover: '#69cfa7', content: '#0d1a15', subtle: '#16302640' },
    surface: { app: '#0f1714', sidebar: '#0b110f' },
  },
});
```

Register it before the app mounts:

```ts
import { themeRegistry } from '@/features/theme/theme-store';
import { acmeTheme } from './acme-theme';

themeRegistry.register(acmeTheme);
```

It then appears in **Settings → Appearance → Theme**.

## The contract

Both `light` and `dark` are required. Users pick a theme and, independently, light/dark/follow-the-system — a theme offering only one variant would leave a third of that matrix broken.

| Group     | Tokens                                                                            |
| --------- | --------------------------------------------------------------------------------- |
| `surface` | `app`, `sidebar`, `panel`, `raised`, `sunken`, `overlay`, `selected`, `highlight` |
| `content` | `primary`, `secondary`, `muted`, `inverted`, `link`                               |
| `border`  | `subtle`, `strong`, `focus`                                                       |
| `accent`  | `base`, `hover`, `content`, `subtle`                                              |
| `status`  | `online`, `away`, `busy`, `offline`, `danger`, `warning`, `success`, `info`       |
| `radius`  | `sm`, `md`, `lg`, `xl`                                                            |
| `shadow`  | `sm`, `md`, `lg`                                                                  |
| `font`    | `sans`, `mono`                                                                    |

Values are ordinary CSS: `#rrggbb`, `oklch(...)`, `rgb(... / ...)`. No build step, no preprocessor.

Two that are easy to get wrong:

- **`accent.content`** is the text drawn _on_ `accent.base`. The default theme uses white in light mode and near-black in dark mode, because its dark accent is a light amber — white on it would fail contrast.
- **`border.focus`** is the focus ring. It has to be visible against `surface.app`, `surface.sidebar` and `surface.raised`, not just one of them.

## Validation

`register()` validates and throws `InvalidThemeError` listing every problem by path:

```
Theme "acme" does not match the theme contract:
  - light.tokens.accent.hover: Invalid input: expected string, received undefined
  - light.tokens.accent.subtle: Invalid input: expected string, received undefined
```

Failing at registration is deliberate: a partially applied theme inherits leftover variables from the previous one and breaks in ways that only appear on one screen, in one state.

Validate yours in a test:

```ts
import { parseTheme } from '@open-rocket-chat/theme';
import { acmeTheme } from '../acme-theme';

it('satisfies the theme contract', () => {
  expect(() => parseTheme(acmeTheme)).not.toThrow();
});
```

## Checking your work

- Read a full room in both variants, not just the sidebar. Own messages use `surface.highlight`, which is the token most often left at a value that vanishes against `surface.app`.
- Tab through the sidebar and the composer to confirm the focus ring is visible everywhere.
- Check contrast on `content.muted` over `surface.sidebar` — it is the smallest text in the app and the first thing to become unreadable.

## Contributing a theme

Themes live in `packages/theme/src/themes/`. Add the file, export it from `src/index.ts`, add it to `builtInThemes` in `src/registry.ts`, and include a screenshot of both variants in your pull request. `nord-slate.ts` is a complete worked example.

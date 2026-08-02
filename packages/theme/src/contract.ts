import { z } from 'zod';

/**
 * The theme contract.
 *
 * Every token here is required. That is deliberate: a theme that omits one
 * would otherwise inherit whatever the previous theme left on the document and
 * break in ways that only show up on one screen, in one state. Validation
 * happens when a theme is registered, so a community theme fails loudly at
 * startup with the names of what it is missing — never silently at render time.
 *
 * Values are plain CSS colours (`#rrggbb`, `oklch(...)`, `rgb(...)`), so theme
 * authors need no build step and no knowledge of our internals.
 */

const Color = z.string().min(1).describe('Any CSS colour value');

export const SurfaceTokensSchema = z.object({
  /** Background behind the message timeline. */
  app: Color,
  /** The room list column. */
  sidebar: Color,
  /** Secondary columns such as Room Info and the thread pane. */
  panel: Color,
  /** Cards, hovered rows, anything sitting above `app`. */
  raised: Color,
  /** Inputs, wells, and areas that read as recessed. */
  sunken: Color,
  /** Backdrop behind modals and the media lightbox. */
  overlay: Color,
  /** The selected room in the sidebar. */
  selected: Color,
  /** Own messages and mention highlights. */
  highlight: Color,
});

export const ContentTokensSchema = z.object({
  primary: Color,
  secondary: Color,
  muted: Color,
  /** Text placed on `accent.base` or `surface.selected`. */
  inverted: Color,
  link: Color,
});

export const BorderTokensSchema = z.object({
  subtle: Color,
  strong: Color,
  /** The focus ring. Must be visible against every surface. */
  focus: Color,
});

export const AccentTokensSchema = z.object({
  base: Color,
  hover: Color,
  /** Text and icons drawn on top of `base`. */
  content: Color,
  /** A tinted wash of the accent, for badges and quiet emphasis. */
  subtle: Color,
});

export const StatusTokensSchema = z.object({
  online: Color,
  away: Color,
  busy: Color,
  offline: Color,
  danger: Color,
  warning: Color,
  success: Color,
  info: Color,
});

export const RadiusTokensSchema = z.object({
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
  xl: z.string(),
});

export const ShadowTokensSchema = z.object({
  sm: z.string(),
  md: z.string(),
  lg: z.string(),
});

export const FontTokensSchema = z.object({
  sans: z.string(),
  mono: z.string(),
});

export const ThemeTokensSchema = z.object({
  surface: SurfaceTokensSchema,
  content: ContentTokensSchema,
  border: BorderTokensSchema,
  accent: AccentTokensSchema,
  status: StatusTokensSchema,
  radius: RadiusTokensSchema,
  shadow: ShadowTokensSchema,
  font: FontTokensSchema,
});

export type ThemeTokens = z.infer<typeof ThemeTokensSchema>;

export const ThemeVariantSchema = z.object({
  /**
   * Tells the browser which native form controls and scrollbars to draw. Get
   * this wrong and a dark theme gets white scrollbars.
   */
  colorScheme: z.enum(['light', 'dark']),
  tokens: ThemeTokensSchema,
});

export type ThemeVariant = z.infer<typeof ThemeVariantSchema>;

/**
 * A theme ships both variants. Users pick a *theme*, and independently pick
 * light, dark, or follow-the-system — so a theme offering only one of them
 * would leave a third of that matrix broken.
 */
export const ThemeSchema = z.object({
  /** Stable, URL-safe identifier; also what gets persisted. */
  id: z
    .string()
    .min(1)
    .regex(/^[a-z0-9][a-z0-9-]*$/, 'Theme ids must be lowercase, and may contain digits and dashes'),
  name: z.string().min(1),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().url().optional(),
  light: ThemeVariantSchema,
  dark: ThemeVariantSchema,
});

export type Theme = z.infer<typeof ThemeSchema>;

/** Raised when a theme does not satisfy the contract, listing every problem. */
export class InvalidThemeError extends Error {
  override readonly name = 'InvalidThemeError';

  constructor(
    readonly themeId: string,
    readonly issues: { path: string; message: string }[],
  ) {
    super(
      `Theme "${themeId}" does not match the theme contract:\n` +
        issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n'),
    );
  }
}

/**
 * Validates a theme against the contract.
 *
 * Community themes should call this in their own tests; the registry calls it
 * for every theme it accepts.
 */
export const parseTheme = (candidate: unknown): Theme => {
  const result = ThemeSchema.safeParse(candidate);

  if (!result.success) {
    const id =
      typeof candidate === 'object' && candidate !== null && 'id' in candidate
        ? String((candidate as { id: unknown }).id)
        : '<unknown>';

    throw new InvalidThemeError(
      id,
      result.error.issues.map((issue) => ({
        path: issue.path.join('.') || '<root>',
        message: issue.message,
      })),
    );
  }

  return result.data;
};

/**
 * Builds a theme from a partial override on top of an existing one.
 *
 * The common case for a community theme is "the default, but with our brand
 * colour". Doing that by hand means copying ~40 tokens and re-copying them
 * whenever the contract grows.
 */
export const extendTheme = (
  base: Theme,
  overrides: {
    id: string;
    name: string;
    description?: string;
    author?: string;
    homepage?: string;
    light?: DeepPartial<ThemeTokens>;
    dark?: DeepPartial<ThemeTokens>;
  },
): Theme =>
  parseTheme({
    id: overrides.id,
    name: overrides.name,
    ...(overrides.description ? { description: overrides.description } : {}),
    ...(overrides.author ? { author: overrides.author } : {}),
    ...(overrides.homepage ? { homepage: overrides.homepage } : {}),
    light: {
      colorScheme: 'light',
      tokens: mergeTokens(base.light.tokens, overrides.light),
    },
    dark: {
      colorScheme: 'dark',
      tokens: mergeTokens(base.dark.tokens, overrides.dark),
    },
  });

type DeepPartial<T> = { [K in keyof T]?: Partial<T[K]> };

const mergeTokens = (base: ThemeTokens, overrides: DeepPartial<ThemeTokens> | undefined): ThemeTokens => {
  if (!overrides) return base;

  const merged = { ...base } as ThemeTokens;
  for (const group of Object.keys(base) as (keyof ThemeTokens)[]) {
    const override = overrides[group];
    if (override) {
      merged[group] = { ...base[group], ...override } as never;
    }
  }
  return merged;
};

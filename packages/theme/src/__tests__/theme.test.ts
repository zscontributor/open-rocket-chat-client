import { describe, expect, it } from 'vitest';

import { toCssVariables } from '../apply.js';
import { extendTheme, InvalidThemeError, parseTheme, ThemeTokensSchema } from '../contract.js';
import { createThemeRegistry } from '../registry.js';
import { defaultTheme } from '../themes/default.js';
import { nordSlateTheme } from '../themes/nord-slate.js';

describe('the contract', () => {
  it('accepts the built-in themes', () => {
    expect(() => parseTheme(defaultTheme)).not.toThrow();
    expect(() => parseTheme(nordSlateTheme)).not.toThrow();
  });

  it('names every missing token instead of failing at render time', () => {
    const broken = {
      ...defaultTheme,
      id: 'broken',
      light: {
        colorScheme: 'light',
        tokens: {
          ...defaultTheme.light.tokens,
          // A theme that forgets a whole group is the common authoring mistake.
          accent: { base: '#000000' },
        },
      },
    };

    try {
      parseTheme(broken);
      expect.unreachable('should have rejected the theme');
    } catch (error) {
      expect(error).toBeInstanceOf(InvalidThemeError);
      const issues = (error as InvalidThemeError).issues.map((issue) => issue.path);
      expect(issues).toEqual(
        expect.arrayContaining([
          'light.tokens.accent.hover',
          'light.tokens.accent.content',
          'light.tokens.accent.subtle',
        ]),
      );
    }
  });

  it('requires both light and dark variants', () => {
    const { dark: _dark, ...lightOnly } = defaultTheme;
    expect(() => parseTheme(lightOnly)).toThrow(InvalidThemeError);
  });

  it('rejects an id that would not be safe to persist or put in a URL', () => {
    expect(() => parseTheme({ ...defaultTheme, id: 'Not Safe' })).toThrow(InvalidThemeError);
  });
});

describe('extendTheme', () => {
  it('keeps every token the override did not mention', () => {
    const theme = extendTheme(defaultTheme, {
      id: 'brand',
      name: 'Brand',
      light: { accent: { base: '#ff0000' } },
    });

    expect(theme.light.tokens.accent.base).toBe('#ff0000');
    expect(theme.light.tokens.accent.hover).toBe(defaultTheme.light.tokens.accent.hover);
    expect(theme.light.tokens.surface.app).toBe(defaultTheme.light.tokens.surface.app);
    // Untouched variants must still be complete.
    expect(theme.dark.tokens).toEqual(defaultTheme.dark.tokens);
  });

  it('produces a theme that satisfies the contract', () => {
    const theme = extendTheme(defaultTheme, { id: 'brand', name: 'Brand', dark: { content: { link: '#abcdef' } } });
    expect(() => parseTheme(theme)).not.toThrow();
  });
});

describe('the registry', () => {
  it('lists built-in themes with the default first', () => {
    const registry = createThemeRegistry();
    expect(registry.list()[0]?.id).toBe('default');
    expect(registry.has('nord-slate')).toBe(true);
  });

  it('refuses an invalid theme instead of half-applying it', () => {
    const registry = createThemeRegistry();
    expect(() => registry.register({ id: 'oops', name: 'Oops' })).toThrow(InvalidThemeError);
    expect(registry.has('oops')).toBe(false);
  });

  it('falls back to the default when a stored preference names a theme that is gone', () => {
    const registry = createThemeRegistry();
    expect(registry.resolve('uninstalled-theme').id).toBe('default');
    expect(registry.resolve(undefined).id).toBe('default');
  });
});

describe('css variables', () => {
  it('namespaces and flattens every token', () => {
    const variables = toCssVariables(defaultTheme.light.tokens);

    expect(variables['--orc-surface-app']).toBe('#ffffff');
    expect(variables['--orc-accent-base']).toBe('#c2762b');
    expect(variables['--orc-radius-lg']).toBe('14px');
  });

  it('emits a variable for every token in the contract', () => {
    const expected = Object.entries(ThemeTokensSchema.shape).flatMap(([group, schema]) =>
      Object.keys((schema as { shape: Record<string, unknown> }).shape).map((name) => `--orc-${group}-${name}`),
    );

    const variables = toCssVariables(defaultTheme.light.tokens);
    expect(Object.keys(variables).sort()).toEqual(expected.sort());
  });
});

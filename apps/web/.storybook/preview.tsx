import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Decorator, Preview } from '@storybook/react-vite';
import { applyTheme } from '@open-rocket-chat/theme';
import { useEffect, type ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';

// The app's registry, so stories offer exactly the themes the app does —
// including any a deployment registered on top of the built-in ones.
import { themeRegistry } from '../src/features/theme/theme-store';
import { initI18n, i18next, LOCALES } from '../src/i18n';
import { IconProvider } from '../src/ui/icon';
import '../src/styles.css';

void initI18n();

/**
 * Stories render against the real theme system, not a hard-coded palette.
 *
 * This is what lets a theme author check their work: switch theme and colour
 * scheme from the toolbar and every component re-renders through the same
 * `--orc-*` variables the app uses. Without it, checking a theme means running
 * Rocket.Chat, the gateway and the web app just to look at a button.
 */
const ThemedFrame = ({
  themeId,
  scheme,
  children,
}: {
  themeId: string;
  scheme: 'light' | 'dark';
  children: ReactNode;
}) => {
  useEffect(() => {
    applyTheme(themeRegistry.resolve(themeId), scheme);
  }, [themeId, scheme]);

  return <div className="bg-app text-content min-h-40 p-6 font-sans">{children}</div>;
};

// A component rather than an inline body: a decorator is a lowercase function,
// which React's lint rules cannot recognise as a place hooks may be called.
const withTheme: Decorator = (Story, context) => (
  <ThemedFrame themeId={context.globals.theme as string} scheme={context.globals.colorScheme as 'light' | 'dark'}>
    <Story />
  </ThemedFrame>
);

const LocalisedFrame = ({ locale, children }: { locale: string; children: ReactNode }) => {
  useEffect(() => {
    void i18next.changeLanguage(locale);
  }, [locale]);

  return <I18nextProvider i18n={i18next}>{children}</I18nextProvider>;
};

const withLocale: Decorator = (Story, context) => (
  <LocalisedFrame locale={context.globals.locale as string}>
    <Story />
  </LocalisedFrame>
);

/**
 * Components that read from React Query need a client, even a throwaway one.
 * Created once for the whole session rather than per story, so a story does not
 * refetch what the previous one already has.
 */
const storyQueryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: Number.POSITIVE_INFINITY } },
});

const withQueryClient: Decorator = (Story) => (
  <QueryClientProvider client={storyQueryClient}>
    <IconProvider>
      <Story />
    </IconProvider>
  </QueryClientProvider>
);

const preview: Preview = {
  parameters: {
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    a11y: { test: 'error' },
    layout: 'fullscreen',
  },

  globalTypes: {
    theme: {
      description: 'Theme',
      defaultValue: 'default',
      toolbar: {
        icon: 'paintbrush',
        items: themeRegistry.list().map((theme) => ({ value: theme.id, title: theme.name })),
        dynamicTitle: true,
      },
    },
    colorScheme: {
      description: 'Colour scheme',
      defaultValue: 'light',
      toolbar: {
        icon: 'mirror',
        items: [
          { value: 'light', title: 'Light' },
          { value: 'dark', title: 'Dark' },
        ],
        dynamicTitle: true,
      },
    },
    locale: {
      description: 'Language',
      defaultValue: 'en',
      toolbar: {
        icon: 'globe',
        // Vietnamese strings run noticeably longer than English; switching here
        // is how truncation gets caught before it ships.
        items: LOCALES.map((entry) => ({ value: entry.code, title: entry.name })),
        dynamicTitle: true,
      },
    },
  },

  decorators: [withTheme, withLocale, withQueryClient],
};

export default preview;

import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y', '@storybook/addon-docs'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  // The app's own Vite config supplies the `@/` alias and the Tailwind plugin,
  // so stories compile exactly the way the app does.
  viteFinal: async (config) => config,
};

export default config;

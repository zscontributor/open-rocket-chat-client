import type { ColorSchemePreference } from '@open-rocket-chat/theme';
import * as Dialog from '@radix-ui/react-dialog';
import { useRef, useState, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';

import { GiphyKeyLink } from '@/features/messages/gif-picker';
import { hasBuildTimeGiphyKey, useGiphyKeyStore } from '@/features/messages/giphy';
import { NotificationSettings } from '@/features/notifications/notification-settings';
import { useThemeStore } from '@/features/theme/theme-store';
import { changeLocale, LOCALES, type LocaleCode } from '@/i18n';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui-store';
import { Icons } from '@/ui/icon';
import { Input } from '@/ui/input';
import { Select } from '@/ui/select';

const SCHEMES: { value: ColorSchemePreference; icon: React.ReactNode }[] = [
  { value: 'system', icon: <Icons.settings size={18} /> },
  { value: 'light', icon: <Icons.themeLight size={18} /> },
  { value: 'dark', icon: <Icons.themeDark size={18} /> },
];

const SETTINGS_TABS = [
  { id: 'appearance', labelKey: 'appearance.title', icon: Icons.palette },
  { id: 'notifications', labelKey: 'notifications.title', icon: Icons.notifications },
  { id: 'gif', labelKey: 'gif.title', icon: Icons.gif },
  { id: 'language', labelKey: 'language.title', icon: Icons.translate },
] as const;

type SettingsTab = (typeof SETTINGS_TABS)[number]['id'];

export const SettingsDialog = () => {
  const { t } = useTranslation('settings');
  const { t: tCommon } = useTranslation('common');
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const panelViewport = useRef<HTMLDivElement>(null);

  const open = useUiStore((state) => state.settingsOpen);
  const setOpen = useUiStore((state) => state.setSettingsOpen);

  const selectTab = (tab: SettingsTab) => {
    setActiveTab(tab);
    if (panelViewport.current) panelViewport.current.scrollTop = 0;
  };

  const focusTab = (index: number) => {
    const tab = SETTINGS_TABS[index];
    if (!tab) return;
    selectTab(tab.id);
    document.getElementById(`settings-tab-${tab.id}`)?.focus();
  };

  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let nextIndex: number | undefined;

    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
      nextIndex = (index + 1) % SETTINGS_TABS.length;
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
      nextIndex = (index - 1 + SETTINGS_TABS.length) % SETTINGS_TABS.length;
    } else if (event.key === 'Home') {
      nextIndex = 0;
    } else if (event.key === 'End') {
      nextIndex = SETTINGS_TABS.length - 1;
    }

    if (nextIndex === undefined) return;
    event.preventDefault();
    focusTab(nextIndex);
  };

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="bg-overlay fixed inset-0 z-40" />
        <Dialog.Content className="bg-panel border-line fixed top-1/2 left-1/2 z-40 flex max-h-[85vh] w-[min(40rem,92vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border shadow-lg outline-none">
          <div className="flex shrink-0 items-center justify-between px-5 py-4">
            <Dialog.Title className="text-base font-semibold">{t('title')}</Dialog.Title>
            <Dialog.Close
              aria-label={tCommon('action.close')}
              className="text-content-muted hover:bg-sunken hover:text-content rounded-md p-1 transition-colors"
            >
              <Icons.close size={18} />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">{t('title')}</Dialog.Description>

          <div className="border-line scrollbar-slim shrink-0 overflow-x-auto border-y px-2">
            <div role="tablist" aria-label={t('title')} className="flex min-w-max gap-1">
              {SETTINGS_TABS.map((tab, index) => {
                const Icon = tab.icon;
                const selected = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    id={`settings-tab-${tab.id}`}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    aria-controls={`settings-panel-${tab.id}`}
                    tabIndex={selected ? 0 : -1}
                    onClick={() => selectTab(tab.id)}
                    onKeyDown={(event) => handleTabKeyDown(event, index)}
                    className={cn(
                      'flex h-11 items-center gap-2 border-b-2 px-3 text-sm font-medium transition-colors outline-none',
                      'focus-visible:ring-focus focus-visible:ring-2 focus-visible:ring-inset',
                      selected
                        ? 'border-accent text-accent'
                        : 'text-content-muted hover:text-content border-transparent',
                    )}
                  >
                    <Icon size={16} />
                    {t(tab.labelKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <div ref={panelViewport} className="scrollbar-slim min-h-0 flex-1 overflow-y-auto p-5">
            <div
              id="settings-panel-appearance"
              role="tabpanel"
              aria-labelledby="settings-tab-appearance"
              tabIndex={activeTab === 'appearance' ? 0 : -1}
              hidden={activeTab !== 'appearance'}
            >
              <AppearanceSettings />
            </div>
            <div
              id="settings-panel-notifications"
              role="tabpanel"
              aria-labelledby="settings-tab-notifications"
              tabIndex={activeTab === 'notifications' ? 0 : -1}
              hidden={activeTab !== 'notifications'}
            >
              <NotificationSettings />
            </div>
            <div
              id="settings-panel-gif"
              role="tabpanel"
              aria-labelledby="settings-tab-gif"
              tabIndex={activeTab === 'gif' ? 0 : -1}
              hidden={activeTab !== 'gif'}
            >
              <GifSettings />
            </div>
            <div
              id="settings-panel-language"
              role="tabpanel"
              aria-labelledby="settings-tab-language"
              tabIndex={activeTab === 'language' ? 0 : -1}
              hidden={activeTab !== 'language'}
            >
              <LanguageSettings />
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

const AppearanceSettings = () => {
  const { t } = useTranslation('settings');
  const themeId = useThemeStore((state) => state.themeId);
  const setTheme = useThemeStore((state) => state.setTheme);
  const preference = useThemeStore((state) => state.preference);
  const setPreference = useThemeStore((state) => state.setPreference);
  const themes = useThemeStore((state) => state.availableThemes)();

  return (
    <>
      <p className="mb-1.5 text-sm font-medium">{t('appearance.colorScheme')}</p>
      <div className="mb-4 flex gap-2">
        {SCHEMES.map((scheme) => (
          <button
            key={scheme.value}
            type="button"
            aria-pressed={preference === scheme.value}
            onClick={() => setPreference(scheme.value)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1.5 rounded-lg border px-3 py-3 text-xs transition-colors',
              preference === scheme.value
                ? 'border-accent bg-accent-subtle text-accent'
                : 'border-line text-content-secondary hover:bg-sunken',
            )}
          >
            {scheme.icon}
            {t(`appearance.scheme.${scheme.value}`)}
          </button>
        ))}
      </div>

      <p className="mb-1.5 text-sm font-medium">{t('appearance.theme')}</p>
      <div className="space-y-1.5">
        {themes.map((theme) => (
          <button
            key={theme.id}
            type="button"
            aria-pressed={themeId === theme.id}
            onClick={() => setTheme(theme.id)}
            className={cn(
              'flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              themeId === theme.id ? 'border-accent bg-accent-subtle' : 'border-line hover:bg-sunken',
            )}
          >
            {/* Swatches read straight from the theme, so the preview cannot
                drift from what selecting it actually does. */}
            <span className="flex shrink-0 gap-1">
              {[theme.light.tokens.accent.base, theme.light.tokens.surface.sidebar, theme.dark.tokens.surface.app].map(
                (colour) => (
                  <span
                    key={colour}
                    style={{ backgroundColor: colour }}
                    className="border-line size-5 rounded-md border"
                  />
                ),
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{theme.name}</span>
              {theme.description ? (
                <span className="text-content-muted block truncate text-xs">{theme.description}</span>
              ) : null}
            </span>

            {themeId === theme.id ? <Icons.success size={18} className="text-accent shrink-0" /> : null}
          </button>
        ))}
      </div>
    </>
  );
};

const GifSettings = () => {
  const { t } = useTranslation('settings');
  const giphyKey = useGiphyKeyStore((state) => state.userKey);
  const setGiphyKey = useGiphyKeyStore((state) => state.setUserKey);

  return (
    <>
      <label htmlFor="giphy-api-key" className="mb-1.5 block text-sm font-medium">
        {t('gif.apiKey')}
      </label>
      <Input
        id="giphy-api-key"
        // Not a password: it identifies the app to GIPHY rather than the
        // person using it, and hiding it only makes a typo harder to spot.
        value={giphyKey}
        onChange={(event) => setGiphyKey(event.target.value)}
        placeholder={hasBuildTimeGiphyKey ? t('gif.usingBuiltIn') : t('gif.apiKeyPlaceholder')}
        spellCheck={false}
        autoComplete="off"
        className="h-9 text-sm"
      />
      <p className="text-content-muted mt-1.5 text-xs">{t('gif.apiKeyHint')}</p>
      <div className="mt-2">
        <GiphyKeyLink label={t('gif.getKey')} />
      </div>
    </>
  );
};

const LanguageSettings = () => {
  const { t, i18n } = useTranslation('settings');
  const resolvedLanguage = i18n.resolvedLanguage ?? 'en';
  const currentLocale =
    LOCALES.find((locale) => resolvedLanguage === locale.code || resolvedLanguage.startsWith(`${locale.code}-`))
      ?.code ?? 'en';

  return (
    <>
      <label htmlFor="display-language" className="mb-1.5 block text-sm font-medium">
        {t('language.label')}
      </label>
      <Select
        id="display-language"
        value={currentLocale}
        onChange={(event) => void changeLocale(event.currentTarget.value as LocaleCode)}
        options={LOCALES.map((locale) => ({
          value: locale.code,
          label: locale.name === locale.englishName ? locale.name : `${locale.name} — ${locale.englishName}`,
        }))}
      />

      <a
        href="https://github.com/zscontributor/open-rocket-chat-client/blob/main/docs/i18n.md"
        target="_blank"
        rel="noreferrer"
        className="text-accent mt-3 inline-flex items-center gap-1.5 text-xs font-medium hover:underline"
      >
        <Icons.openExternal size={14} /> {t('language.helpTranslate')}
      </a>
    </>
  );
};

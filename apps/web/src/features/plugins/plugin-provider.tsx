import type { Plugin, PluginContext, PluginRegistry } from '@open-rocket-chat/plugin-sdk';
import { createPluginRegistry } from '@open-rocket-chat/plugin-sdk';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth/use-session';
import { useCapabilities } from '@/features/server/use-capabilities';
import { useClient, useServerConnection } from '@/features/servers/server-scope';

const RegistryContext = createContext<PluginRegistry | null>(null);

/**
 * Plugins bundled with this build.
 *
 * Loading remote code would need a sandbox and a trust model neither of which
 * exists yet, so plugins are compiled in: a deployment forks, adds its own to
 * this list, and ships. See `docs/plugins.md`.
 */
export const bundledPlugins: Plugin[] = [];

export const PluginProvider = ({ plugins = bundledPlugins, children }: { plugins?: Plugin[]; children: ReactNode }) => {
  const { data: session } = useSession();
  // Plugins are handed the client for the server on screen, so a contribution
  // acts on the same server the user is looking at.
  const client = useClient();
  const connection = useServerConnection();
  const { data: capabilities } = useCapabilities(Boolean(session));
  const { i18n } = useTranslation();

  const [registry] = useState(() => createPluginRegistry());
  /** Bumped when registration finishes, so consumers re-read the registry. */
  const [, setGeneration] = useState(0);

  useEffect(() => {
    if (plugins.length === 0 || !session) return;

    let cancelled = false;

    void registry
      .registerAll(plugins, { client, capabilities, locale: i18n.resolvedLanguage ?? 'en' })
      .then((errors) => {
        if (cancelled) return;
        for (const error of errors) {
          // Surfaced rather than thrown: a broken extension must not stop
          // somebody reading their messages.
          console.error(error);
        }
        setGeneration((value) => value + 1);
      });

    return () => {
      cancelled = true;
      for (const plugin of plugins) registry.unregister(plugin.id);
    };
    // Re-running on every capabilities refresh would tear plugins down and
    // build them again for no gain; setup only needs a signed-in session, and
    // the server on screen, so plugins hold a client for the right one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plugins, registry, client, connection.user.id]);

  return <RegistryContext value={registry}>{children}</RegistryContext>;
};

export const usePluginRegistry = (): PluginRegistry | null => use(RegistryContext);

/** The context handed to every contribution when it runs. */
export const usePluginContext = (onOpenRoom: (roomId: string) => void): PluginContext | null => {
  const { data: session } = useSession();
  const { i18n } = useTranslation();

  if (!session) return null;

  return {
    session,
    openRoom: onOpenRoom,
    notify: ({ level, message }) => {
      // Until the client has a toast surface, notices go to the console rather
      // than being silently dropped.
      // eslint-disable-next-line no-console
      console[level === 'error' ? 'error' : 'warn'](`[plugin] ${message}`);
    },
    locale: i18n.resolvedLanguage ?? 'en',
  };
};

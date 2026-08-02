import type { SlashCommand } from '@open-rocket-chat/client-sdk';
import { useMutation, useQuery } from '@tanstack/react-query';

import { useClient, useServerKeys } from '@/features/servers/server-scope';

/**
 * The slash commands the connected server offers.
 *
 * Server configuration, so it is fetched once and kept: the list only changes
 * when an administrator installs an app. Commands Rocket.Chat's own web client
 * handles in the browser (`clientOnly`) are dropped — the REST endpoint cannot
 * run them, so offering them would only produce failures.
 */
export const useSlashCommands = (enabled = true) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.commands,
    queryFn: () => client.commands.list(),
    enabled,
    staleTime: 30 * 60_000,
    select: (response) =>
      response.items.filter((command) => !command.clientOnly).sort((a, b) => a.command.localeCompare(b.command)),
  });
};

export const useRunSlashCommand = (roomId: string) => {
  const client = useClient();

  return useMutation({
    mutationFn: (input: { command: string; params: string; threadId?: string }) =>
      client.commands.run({
        command: input.command,
        params: input.params,
        roomId,
        ...(input.threadId ? { threadId: input.threadId } : {}),
      }),
    // The composer reports the reason itself, above the text it refused to
    // send — which is still in the box, ready to be corrected.
    meta: { silentError: true },
  });
};

/**
 * Turns a Rocket.Chat i18n key into something readable.
 *
 * Commands describe themselves with keys (`Archive_Description`,
 * `Slash_Gimme_Description`) that only Rocket.Chat's own translation bundles
 * can resolve. Rather than ship those bundles, the underscores are unpicked:
 * the result is not a translation, but it is what the key was written from, and
 * it beats showing the raw key.
 */
export const readableCommandText = (value: string | null): string => {
  if (!value) return '';
  // Keys never contain spaces; anything that does is already a real sentence.
  if (/\s/.test(value)) return value;

  return value.replace(/_Description$/, '').replace(/_/g, ' ');
};

/** Matches on the command's own name, the way Rocket.Chat's picker does. */
export const matchCommands = (commands: SlashCommand[], term: string): SlashCommand[] => {
  const needle = term.toLowerCase();
  if (!needle) return commands;

  return (
    commands
      .filter((command) => command.command.toLowerCase().includes(needle))
      // A prefix match is what the user is most likely reaching for.
      .sort((a, b) => {
        const byPrefix =
          Number(b.command.toLowerCase().startsWith(needle)) - Number(a.command.toLowerCase().startsWith(needle));
        return byPrefix === 0 ? a.command.localeCompare(b.command) : byPrefix;
      })
  );
};

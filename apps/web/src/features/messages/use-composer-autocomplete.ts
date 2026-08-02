import type { RoomSummary, UserSummary } from '@open-rocket-chat/client-sdk';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { canRunSlashCommand, hasPermission, useCapabilities } from '@/features/server/use-capabilities';
import { useDebounced } from '@/features/rooms/contextual-bar/use-panels';
import { useRoom, useRoomMembers, useRooms } from '@/features/rooms/use-rooms';
import { useClient, useServerConnection, useServerKeys } from '@/features/servers/server-scope';
import { findAutocompleteToken, type AutocompleteToken } from './autocomplete';
import { matchCommands, useSlashCommands } from './use-slash-commands';

/** Enough to choose from without turning the panel into a directory. */
const MAX_ITEMS = 8;

export type AutocompleteItem =
  | { kind: 'user'; key: string; value: string; user: UserSummary; inRoom: boolean }
  /** `@all` and `@here`, which are permissions rather than people. */
  | { kind: 'special'; key: string; value: string; name: 'all' | 'here' }
  | { kind: 'channel'; key: string; value: string; room: RoomSummary }
  | {
      kind: 'command';
      key: string;
      value: string;
      command: string;
      params: string | null;
      description: string | null;
    };

/**
 * People the room already knows about, matched in the browser.
 *
 * This is the same page of members the room header and the info panel read, so
 * on an open room it is already in the cache and costs nothing. It is what the
 * panel answers from first: an unqualified `@` needs no request at all, and a
 * name that is in it appears as fast as it can be typed.
 */
const useLocalMembers = (roomId: string, term: string, enabled: boolean): UserSummary[] => {
  // The default limit is deliberate: any other value would be a second query
  // under the same key as the header's, and the two would fight over it.
  const { data: members } = useRoomMembers(enabled ? roomId : undefined);

  return useMemo(() => {
    if (!members) return [];
    if (!term) return members.slice(0, MAX_ITEMS);

    return members
      .filter(
        (member) => member.username.toLowerCase().includes(term) || member.displayName.toLowerCase().includes(term),
      )
      .slice(0, MAX_ITEMS);
  }, [members, term]);
};

/**
 * The rest: members past the first page, and everybody on the server who is not
 * in the room at all.
 *
 * Only asked for once something has been typed. An empty term makes both routes
 * do their worst work — ranking every member of a large room, then every
 * account on the server — to produce a list the cache above already has.
 *
 * Neither call is allowed to sink the other: a room where the member list is
 * refused still completes from the directory, and a server that rejects the
 * directory search still completes from the room.
 *
 * The term arrives debounced. `users.autocomplete` is one of Rocket.Chat's
 * slower routes, and a request per keystroke both queues up behind itself and
 * times the gateway out — for answers that were obsolete before they arrived.
 */
const useMentionCandidates = (roomId: string, rawTerm: string, enabled: boolean) => {
  const client = useClient();
  const keys = useServerKeys();

  // Trimmed here rather than at the call site so `ben` and `ben ` are one
  // cache entry and one request, not two.
  const term = rawTerm.trim();

  return useQuery({
    queryKey: keys.mentionCandidates(roomId, term),
    enabled: enabled && term.length > 0,
    queryFn: async () => {
      const [members, directory] = await Promise.all([
        client.rooms.members(roomId, { q: term, limit: MAX_ITEMS }).catch(() => null),
        client.users.search(term, MAX_ITEMS).catch(() => null),
      ]);

      const inRoom = new Set((members?.items ?? []).map((member) => member.id));

      return {
        users: [...(members?.items ?? []), ...(directory?.items ?? [])],
        inRoom,
      };
    },
    // Keyed per term, so one that has been typed before answers from the cache;
    // a minute is long enough for one sentence.
    staleTime: 60_000,
    // Without this the panel empties on every keystroke and the list flickers
    // between the old matches and the new ones.
    placeholderData: keepPreviousData,
    // A timed-out autocomplete is not worth two more attempts: by the time they
    // land the user has typed something else, and the retries are what turn a
    // slow server into an unreachable one.
    retry: false,
  });
};

const matchesTerm = (room: RoomSummary, term: string): boolean =>
  (room.name ?? '').toLowerCase().includes(term) || room.displayName.toLowerCase().includes(term);

/**
 * What the composer should offer for whatever the caret is sitting in.
 *
 * The token drives everything: nothing is fetched until a trigger is typed, and
 * the panel closes by itself as soon as the caret leaves the token — which is
 * why the caret has to be passed in rather than read off the textarea.
 */
export const useComposerAutocomplete = ({
  roomId,
  text,
  caret,
  query,
  enabled,
}: {
  roomId: string;
  text: string;
  caret: number | null;
  /**
   * What to search for, when it is no longer what the token says — the panel's
   * own search box, once somebody has typed in it. Null hands the question back
   * to the token, which is where it starts.
   */
  query?: string | null;
  enabled: boolean;
}): {
  token: AutocompleteToken | null;
  /** What the matches were actually looked up by, for the panel to show back. */
  term: string;
  items: AutocompleteItem[];
  isLoading: boolean;
} => {
  const { user: me } = useServerConnection();
  const { data: capabilities } = useCapabilities();
  const { data: room } = useRoom(roomId);

  const token = useMemo(
    () => (enabled && caret !== null ? findAutocompleteToken(text, caret) : null),
    [enabled, text, caret],
  );

  // The search box wins while it has something in it; before that, and after it
  // is cleared, the token is what everything is matched against.
  const searched = (query ?? null) === null ? (token?.term ?? '') : (query as string);
  const term = searched.toLowerCase();

  // Only the network side waits: rooms and commands are matched against lists
  // already in memory, and making those lag behind the keyboard would be a
  // delay bought for nothing.
  const debouncedTerm = useDebounced(searched, 250);

  const localMembers = useLocalMembers(roomId, term, token?.kind === 'user');
  const { data: candidates, isFetching: fetchingUsers } = useMentionCandidates(
    roomId,
    debouncedTerm,
    token?.kind === 'user',
  );
  const { data: rooms } = useRooms(token?.kind === 'channel');
  const { data: commands, isLoading: loadingCommands } = useSlashCommands(token?.kind === 'command');

  const items = useMemo<AutocompleteItem[]>(() => {
    if (!token) return [];

    if (token.kind === 'user') {
      const seen = new Set<string>();
      const users: AutocompleteItem[] = [];

      // The cached members first, and they are already known to be in the room;
      // whatever the server adds fills in behind them, so the list grows rather
      // than being replaced when the request lands.
      const merged = [
        ...localMembers.map((user) => ({ user, inRoom: true })),
        ...(candidates?.users ?? []).map((user) => ({ user, inRoom: candidates?.inRoom.has(user.id) ?? false })),
      ];

      for (const { user, inRoom } of merged) {
        // Mentioning yourself notifies nobody, and the row would only take the
        // place of somebody you might have meant.
        if (user.id === me.id || seen.has(user.id)) continue;
        seen.add(user.id);

        users.push({
          kind: 'user',
          key: user.id,
          value: `@${user.username}`,
          user,
          inRoom,
        });

        if (users.length >= MAX_ITEMS) break;
      }

      // Last, and only where they mean something: a direct message has no
      // room to notify, and both are gated on a permission most people lack.
      const specials = (['all', 'here'] as const).filter(
        (name) =>
          name.startsWith(term) &&
          room?.type !== 'direct' &&
          hasPermission(capabilities, `mention-${name}`, room?.roles ?? []),
      );

      return [
        ...users,
        ...specials.map<AutocompleteItem>((name) => ({
          kind: 'special',
          key: `special:${name}`,
          value: `@${name}`,
          name,
        })),
      ];
    }

    if (token.kind === 'channel') {
      return (rooms ?? [])
        .filter((candidate) => candidate.type !== 'direct' && candidate.name && matchesTerm(candidate, term))
        .sort((a, b) => {
          // Whatever the term opens is what was being reached for.
          const byPrefix =
            Number((b.name ?? '').toLowerCase().startsWith(term)) -
            Number((a.name ?? '').toLowerCase().startsWith(term));
          return byPrefix === 0 ? a.displayName.localeCompare(b.displayName) : byPrefix;
        })
        .slice(0, MAX_ITEMS)
        .map((candidate) => ({
          kind: 'channel',
          key: candidate.id,
          value: `#${candidate.name as string}`,
          room: candidate,
        }));
    }

    return matchCommands(commands ?? [], term)
      .filter((command) => canRunSlashCommand(capabilities, command, room))
      .slice(0, MAX_ITEMS)
      .map((command) => ({
        kind: 'command',
        key: command.command,
        value: `/${command.command}`,
        command: command.command,
        params: command.params,
        description: command.description,
      }));
  }, [token, term, localMembers, candidates, rooms, commands, capabilities, room, me.id]);

  return {
    token,
    term: searched,
    items,
    // Only ever "loading" with nothing to show. A request in flight behind a
    // list of cached members is not something the user needs told about.
    isLoading:
      token?.kind === 'user' ? fetchingUsers && items.length === 0 : token?.kind === 'command' && loadingCommands,
  };
};

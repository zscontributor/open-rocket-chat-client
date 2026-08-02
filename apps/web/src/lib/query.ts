import { GatewayError } from '@open-rocket-chat/client-sdk';
import { MutationCache, QueryClient } from '@tanstack/react-query';

import { showToast } from '@/stores/toast-store';
import { describeError } from './errors';
import { PERSIST_MAX_AGE_MS } from './persist';

/**
 * Per-mutation instructions for the global error handler below.
 *
 * Declaring it on `Register` rather than passing loose objects means a typo in
 * `meta` is a compile error, and every mutation in the app is checked against
 * the same vocabulary.
 */
declare module '@tanstack/react-query' {
  interface Register {
    mutationMeta: MutationSurface;
  }
}

/**
 * A `type` rather than an `interface`: TanStack only adopts a `mutationMeta`
 * that extends `Record<string, unknown>`, and an interface has no implicit
 * index signature — declared as one, every `meta` in the app silently falls
 * back to the untyped default.
 */
export type MutationSurface = {
  /**
   * Skips the global toast, for the two cases where one is wrong: the caller
   * already renders the failure itself — a form beside its submit button — or
   * the app fired the mutation rather than the user, as marking a room read on
   * open does, leaving nothing for them to act on.
   */
  silentError?: boolean;
};

/**
 * Keys that belong to the session rather than to any one Rocket.Chat server.
 *
 * Everything else hangs off `serverKeys`, so realtime handlers and components
 * cannot drift apart on how a cache entry is addressed.
 */
export const queryKeys = {
  session: ['session'] as const,
  /** The servers this gateway fronts — public, and the same for every user. */
  servers: ['servers'] as const,
};

/** Root of every server-scoped key. Exported so the persister can recognise them. */
export const SERVER_SCOPE_ROOT = 'server';

/**
 * The cache tree for one Rocket.Chat server.
 *
 * The server id is part of every key because a session can be signed in to
 * several servers at once and Rocket.Chat ids are only unique within one of
 * them: two servers may well hand out the same room id, and merging them into
 * one cache entry would show one server's messages under the other's name.
 * Scoping also makes switching servers free — the one being left keeps its
 * cache instead of being evicted.
 */
export const serverKeys = (serverId: string) => {
  const scope = [SERVER_SCOPE_ROOT, serverId] as const;

  return {
    /** Everything for this server, for dropping it wholesale on sign-out. */
    all: scope,
    rooms: [...scope, 'rooms'] as const,
    room: (roomId: string) => [...scope, 'rooms', roomId] as const,
    roomMembers: (roomId: string) => [...scope, 'rooms', roomId, 'members'] as const,
    /**
     * A filtered member page. Nested under `roomMembers` so adding or removing
     * somebody can invalidate every filter at once — a new member belongs in the
     * unfiltered list and possibly in several searches, and the client has no way
     * to know which.
     */
    roomMembersFiltered: (roomId: string, filters: { q: string; onlineOnly: boolean }) =>
      [...scope, 'rooms', roomId, 'members', filters] as const,
    roomRoles: (roomId: string) => [...scope, 'rooms', roomId, 'roles'] as const,
    roomFiles: (roomId: string) => [...scope, 'rooms', roomId, 'files'] as const,
    /**
     * A filtered file page. Nested under `roomFiles` for the same reason the
     * member pages are nested: an upload arriving or being deleted belongs in
     * the unfiltered list and in some unknown subset of the searches and type
     * filters cached beside it.
     */
    roomFilesFiltered: (roomId: string, filters: { q: string; type: string }) =>
      [...scope, 'rooms', roomId, 'files', filters] as const,
    roomNotifications: (roomId: string) => [...scope, 'rooms', roomId, 'notifications'] as const,
    /** `pinned`, `starred` or `mentions` — three lists with one shape. */
    roomMessageCollection: (roomId: string, kind: string) => [...scope, 'rooms', roomId, 'collection', kind] as const,
    roomThreads: (roomId: string) => [...scope, 'rooms', roomId, 'threads'] as const,
    roomSearch: (roomId: string, term: string) => [...scope, 'rooms', roomId, 'search', term] as const,
    messages: (roomId: string) => [...scope, 'rooms', roomId, 'messages'] as const,
    /**
     * Every thread of the room that has been opened — the prefix the individual
     * thread keys hang off. A reply edited or deleted somewhere else has to
     * reach whichever thread panes are cached, and the event says which room it
     * belongs to but not which of them are open.
     */
    roomThreadMessages: (roomId: string) => [...scope, 'rooms', roomId, 'thread'] as const,
    thread: (roomId: string, threadId: string) => [...scope, 'rooms', roomId, 'thread', threadId] as const,
    user: (userId: string) => [...scope, 'users', userId] as const,
    userSearch: (term: string, limit: number) => [...scope, 'users', 'search', term, limit] as const,
    /**
     * Candidates for an `@` in the composer: this room's members and the
     * server-wide directory, merged. Keyed on the room because who is worth
     * suggesting depends on where you are typing.
     *
     * Deliberately outside the `rooms` subtree: one entry is written per
     * keystroke, and that subtree is the one the persister keeps on disk.
     */
    mentionCandidates: (roomId: string, term: string) => [...scope, 'mentions', roomId, term] as const,
    capabilities: [...scope, 'capabilities'] as const,
    /** Slash commands the server offers. Server configuration, so barely ever changes. */
    commands: [...scope, 'commands'] as const,
    customEmoji: [...scope, 'emoji', 'custom'] as const,
  };
};

export type ServerKeys = ReturnType<typeof serverKeys>;

/**
 * The safety net for everything the server refuses.
 *
 * Rocket.Chat rejects plenty of actions this client is right to offer —
 * direct messages switched off, a room gone read-only, a permission revoked
 * since the page loaded — and a mutation whose only failure handling is an
 * optimistic rollback leaves the user watching their change quietly undo
 * itself with no reason given. Handling it centrally means a new action is
 * never silent by default: it has to opt out with `silentError`.
 *
 * `unauthorized` is excluded because the SDK already drops the app to the
 * login screen, and a toast about an expired session on top of that is noise.
 */
const mutationCache = new MutationCache({
  onError: (error, _variables, _context, mutation) => {
    if (mutation.options.meta?.silentError) return;
    if (error instanceof GatewayError && error.isUnauthenticated) return;

    showToast({ tone: 'error', message: describeError(error) });
  },
});

export const queryClient = new QueryClient({
  mutationCache,
  defaultOptions: {
    queries: {
      // Realtime events push updates in, so background polling would only add
      // load without making anything fresher.
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      // Must outlive the persisted cache, or a restored entry would be
      // garbage-collected before it could ever be used.
      gcTime: PERSIST_MAX_AGE_MS,
      retry: (failureCount, error) => {
        // Retrying an authorisation failure just burns requests and delays the
        // login screen the user actually needs to see.
        if (error instanceof GatewayError) {
          if (error.isUnauthenticated || error.code === 'forbidden' || error.code === 'not_found') return false;
        }
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});

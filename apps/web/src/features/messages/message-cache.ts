import type { Message, RoomFile } from '@open-rocket-chat/client-sdk';
import type { QueryClient } from '@tanstack/react-query';

import type { ServerKeys } from '@/lib/query';

/**
 * The cached message shapes and the writes against them, shared by the
 * mutations in `use-messages` and by the realtime listener.
 *
 * Kept apart from the hooks so the listener does not pull React Query's hook
 * layer in behind it, and so these can be tested as the plain functions they
 * are. The key set is always passed in rather than read from context: realtime
 * events fold into whichever server they arrived from, which is not
 * necessarily the one on screen.
 */

export interface MessagePage {
  items: Message[];
  hasMore: boolean;
  gapBefore: boolean;
}

type InfiniteMessages = { pages: MessagePage[]; pageParams: unknown[] };

/** The pinned/starred/mentions panels page over `{ items }` and nothing else. */
type InfiniteCollection = { pages: { items: Message[] }[] };

/** As above, for the Files panel, which pages over uploads rather than messages. */
type InfiniteFiles = { pages: { items: RoomFile[] }[] };

/**
 * Inserts or replaces a message, and brings the contextual bar's message-derived
 * panels along with it.
 *
 * Every path that folds a message into the cache goes through here — a send, an
 * edit, an upload, a realtime event — so the panels are synced here rather than
 * at each call site, where the one that forgets is the bug.
 *
 * Both the REST response and the realtime echo of a send arrive for the same
 * message, so this must be idempotent — otherwise every message the user sends
 * appears twice.
 */
export const upsertMessage = (queryClient: QueryClient, keys: ServerKeys, roomId: string, message: Message): void => {
  queryClient.setQueryData<InfiniteMessages>(keys.messages(roomId), (current) => {
    if (!current) return current;

    const pages = current.pages.map((page) => ({
      ...page,
      items: page.items.map((item) => (item.id === message.id ? message : item)),
    }));

    const exists = current.pages.some((page) => page.items.some((item) => item.id === message.id));
    if (exists) return { ...current, pages };

    // Page 0 holds the newest window, and a new message belongs at its end.
    const first = pages[0];
    if (!first) return { ...current, pages };

    return {
      ...current,
      pages: [{ ...first, items: [...first.items, message] }, ...pages.slice(1)],
    };
  });

  syncThreadPanes(queryClient, keys, roomId, message);
  syncMessageCollections(queryClient, keys, roomId, message);
  syncRoomFiles(queryClient, keys, roomId, message);
};

/**
 * Carries a message into whichever thread panes are cached for the room.
 *
 * A thread pane is its own query, so the timeline write above says nothing
 * about it: a reply sent from the pane, or one arriving over the wire while it
 * is open, would sit in the room's cache and never appear in the thread it was
 * posted to.
 *
 * A message already listed is replaced wherever it sits — that covers an edit,
 * and it covers the parent, which is not a reply but is drawn at the top of its
 * own pane. Otherwise only a reply belonging to that pane is appended.
 */
const syncThreadPanes = (queryClient: QueryClient, keys: ServerKeys, roomId: string, message: Message): void => {
  for (const [queryKey, cached] of queryClient.getQueriesData<InfiniteMessages>({
    queryKey: keys.roomThreadMessages(roomId),
  })) {
    if (!cached) continue;

    const exists = cached.pages.some((page) => page.items.some((item) => item.id === message.id));
    if (exists) {
      queryClient.setQueryData<InfiniteMessages>(queryKey, {
        ...cached,
        pages: cached.pages.map((page) => ({
          ...page,
          items: page.items.map((item) => (item.id === message.id ? message : item)),
        })),
      });
      continue;
    }

    // The pane's thread is the last segment of its key.
    if (message.threadId !== queryKey[queryKey.length - 1]) continue;

    // Page 0 is the newest window, and a new reply belongs at its end.
    const first = cached.pages[0];
    if (!first) continue;

    queryClient.setQueryData<InfiniteMessages>(queryKey, {
      ...cached,
      pages: [{ ...first, items: [...first.items, message] }, ...cached.pages.slice(1)],
    });
  }
};

/**
 * Drops a message, and with it the uploads it carried.
 *
 * Returns the message as it was, which is the only record of what the deletion
 * took with it — the event carries an id and nothing else.
 */
export const removeMessage = (
  queryClient: QueryClient,
  keys: ServerKeys,
  roomId: string,
  messageId: string,
): Message | undefined => {
  const cached = queryClient.getQueryData<InfiniteMessages>(keys.messages(roomId));
  const removed = cached?.pages.flatMap((page) => page.items).find((item) => item.id === messageId);

  queryClient.setQueryData<InfiniteMessages>(keys.messages(roomId), (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.filter((item) => item.id !== messageId),
      })),
    };
  });

  forEachThreadPane(queryClient, keys, roomId, (page) => ({
    ...page,
    items: page.items.filter((item) => item.id !== messageId),
  }));

  // A message that is gone is gone from the panels too. Only what was cached
  // can be reasoned about: a deletion arriving for a message the timeline never
  // loaded leaves the Files panel to its next fetch.
  if (removed?.files.length) void queryClient.invalidateQueries({ queryKey: keys.roomFiles(roomId) });
  if (removed?.pinned) void queryClient.invalidateQueries({ queryKey: keys.roomMessageCollection(roomId, 'pinned') });
  if (removed?.starred) void queryClient.invalidateQueries({ queryKey: keys.roomMessageCollection(roomId, 'starred') });

  return removed;
};

export const patchMessage = (
  queryClient: QueryClient,
  keys: ServerKeys,
  roomId: string,
  messageId: string,
  update: (message: Message) => Message,
): void => {
  queryClient.setQueryData<InfiniteMessages>(keys.messages(roomId), (current) => {
    if (!current) return current;
    return {
      ...current,
      pages: current.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => (item.id === messageId ? update(item) : item)),
      })),
    };
  });

  forEachThreadPane(queryClient, keys, roomId, (page) => ({
    ...page,
    items: page.items.map((item) => (item.id === messageId ? update(item) : item)),
  }));
};

/**
 * Applies a page rewrite to every cached thread pane in the room.
 *
 * A deletion or a flag arrives addressed to a message and a room, never to a
 * thread, so which panes hold it is not knowable in advance — every one of them
 * is rewritten and the ones that never held it are left unchanged.
 */
const forEachThreadPane = (
  queryClient: QueryClient,
  keys: ServerKeys,
  roomId: string,
  rewrite: (page: MessagePage) => MessagePage,
): void => {
  for (const [queryKey] of queryClient.getQueriesData<InfiniteMessages>({
    queryKey: keys.roomThreadMessages(roomId),
  })) {
    queryClient.setQueryData<InfiniteMessages>(queryKey, (current) =>
      current ? { ...current, pages: current.pages.map(rewrite) } : current,
    );
  }
};

/**
 * Keeps the contextual bar's Pinned and Starred panels in step with a message.
 *
 * Those lists are queries of their own, so folding a message into the timeline
 * says nothing about them: one pinned elsewhere never appears, and one unpinned
 * elsewhere never leaves. What the cached list already believes is compared
 * against the flag on the message, and only a list that disagrees is
 * invalidated — every message that arrives would otherwise refetch both.
 *
 * A panel that was never opened has no cache and so lists nothing, which is the
 * right answer: an unopened panel fetches on open anyway.
 */
export const syncMessageCollections = (
  queryClient: QueryClient,
  keys: ServerKeys,
  roomId: string,
  message: Message,
): void => {
  for (const flag of ['pinned', 'starred'] as const) {
    const queryKey = keys.roomMessageCollection(roomId, flag);
    const cached = queryClient.getQueryData<InfiniteCollection>(queryKey);
    const listed = cached?.pages.some((page) => page.items.some((item) => item.id === message.id)) ?? false;

    if (listed !== message[flag]) void queryClient.invalidateQueries({ queryKey });
  }
};

/**
 * Keeps the contextual bar's Files panel in step with a message that carries
 * uploads.
 *
 * The panel pages over the room's uploads rather than over its messages, so a
 * file posted from another client — or from this one, whose upload only touches
 * the timeline — never reaches it.
 *
 * Each cached filter is judged on its own, because the same upload belongs in
 * "All" and in "Images" but not in a search for another name. One that already
 * lists every file on the message is left alone, so editing the caption of a
 * photo does not cost the panel a refetch.
 */
export const syncRoomFiles = (queryClient: QueryClient, keys: ServerKeys, roomId: string, message: Message): void => {
  if (message.files.length === 0) return;

  for (const [queryKey, cached] of queryClient.getQueriesData<InfiniteFiles>({ queryKey: keys.roomFiles(roomId) })) {
    const listed = new Set(cached?.pages.flatMap((page) => page.items.map((file) => file.id)) ?? []);

    if (!message.files.every((file) => listed.has(file.id))) void queryClient.invalidateQueries({ queryKey });
  }
};

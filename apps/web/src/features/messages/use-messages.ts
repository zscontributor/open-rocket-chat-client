import type { Message, UploadProgress } from '@open-rocket-chat/client-sdk';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import { useClient, useServerKeys } from '@/features/servers/server-scope';
import { patchMessage, removeMessage, upsertMessage, type MessagePage } from './message-cache';

const PAGE_SIZE = 50;

/**
 * Room history, paged backwards.
 *
 * The cursor is the timestamp of the oldest message loaded rather than an
 * offset: a chat timeline shifts every time somebody posts, and offset paging
 * would duplicate or skip messages while scrolling back.
 */
export const useMessages = (roomId: string | undefined) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.messages(roomId ?? ''),
    enabled: Boolean(roomId),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      client.messages.list(roomId as string, { limit: PAGE_SIZE, before: pageParam }) as Promise<MessagePage>,
    getNextPageParam: (lastPage) => {
      if (!lastPage.hasMore) return undefined;
      // Pages come back oldest-first, so the next page starts before item 0.
      return lastPage.items[0]?.createdAt;
    },
    select: (data) => ({
      // Pages are appended as the user scrolls up, so the newest page is first
      // in `pages` order only for the initial load; reversing gives a single
      // chronological list.
      messages: [...data.pages].reverse().flatMap((page) => page.items),
      gapBefore: data.pages.some((page) => page.gapBefore),
    }),
  });
};

/**
 * One thread's replies, paged backwards from the newest.
 *
 * Offsets rather than the timestamp cursor the room timeline uses: a thread is
 * a closed list that only ever grows at its end, so an offset addresses the
 * same reply between two requests — and Rocket.Chat offers nothing else here.
 *
 * A query of its own rather than a filter over the room's cache, which is what
 * this used to be: that cache holds one window of the main timeline, and a
 * thread's replies are not in the main timeline at all. Anything the window did
 * not happen to cover was simply missing from the pane.
 *
 * The parent arrives with the oldest page, so reaching the top of a thread
 * shows the message it hangs off without a second request.
 */
export const useThreadMessages = (roomId: string, threadId: string) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.thread(roomId, threadId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) =>
      client.messages.list(roomId, { threadId, offset: pageParam, limit: PAGE_SIZE }) as Promise<MessagePage>,
    getNextPageParam: (lastPage, _pages, lastOffset) => {
      if (!lastPage.hasMore) return undefined;
      // An empty page cannot advance the offset, and asking again would return
      // the same nothing forever.
      if (lastPage.items.length === 0) return undefined;
      return lastOffset + lastPage.items.length;
    },
    // Page 0 is the newest window and each page after it is older, so the pages
    // are flattened by timestamp rather than concatenated. Sorting also absorbs
    // the duplicate a reply arriving mid-session causes: it shifts every offset
    // behind it by one, so the next page repeats whatever straddled the boundary.
    select: (data) => {
      const byId = new Map<string, Message>();
      for (const page of data.pages) {
        for (const item of page.items) byId.set(item.id, item);
      }

      return {
        messages: [...byId.values()].sort((left, right) => left.createdAt.localeCompare(right.createdAt)),
      };
    },
  });
};

export const useSendMessage = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: { text: string; threadId?: string }) =>
      client.messages.send(roomId, {
        text: input.text,
        threadId: input.threadId,
        // A client-generated id makes a retried send idempotent: Rocket.Chat
        // honours it as the message id, so a duplicate request cannot produce
        // a duplicate message.
        clientMessageId: crypto.randomUUID().replace(/-/g, '').slice(0, 17),
      }),
    // The composer keeps the reason directly above the text it refused to send,
    // which is still sitting in the box waiting to be retried.
    meta: { silentError: true },
    onSuccess: (message) => {
      upsertMessage(queryClient, keys, roomId, message);
    },
  });
};

export const useEditMessage = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, text }: { messageId: string; text: string }) =>
      client.messages.update(roomId, messageId, text),
    // As with sending: the composer is holding the edit and reports it there.
    meta: { silentError: true },
    onSuccess: (message) => upsertMessage(queryClient, keys, roomId, message),
  });
};

export const useDeleteMessage = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (messageId: string) => client.messages.remove(roomId, messageId),
    onSuccess: (_result, messageId) => removeMessage(queryClient, keys, roomId, messageId),
  });
};

/**
 * Pinning and starring, which behave identically from the client's side: one
 * boolean, applied optimistically, with the realtime event as the authority.
 *
 * A mutation rather than a bare call so the timeline updates without waiting
 * for the round-trip, and so the contextual bar's Pinned and Starred lists are
 * refreshed from one place no matter which of them the toggle came from.
 */
export const useSetMessageFlag = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, flag, value }: { messageId: string; flag: 'pinned' | 'starred'; value: boolean }) =>
      flag === 'pinned'
        ? client.messages.setPinned(roomId, messageId, value)
        : client.messages.setStarred(roomId, messageId, value),
    onMutate: ({ messageId, flag, value }) => {
      const previous = queryClient.getQueryData(keys.messages(roomId));
      patchMessage(queryClient, keys, roomId, messageId, (message) => ({ ...message, [flag]: value }));
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(keys.messages(roomId), context.previous);
    },
    // The contextual bar's Pinned and Starred lists are queries of their own, so
    // patching the timeline says nothing about them. `onSettled` rather than
    // `onSuccess`: a rejected toggle rolls the timeline back, and the list has
    // to be refetched to be sure it agrees.
    onSettled: (_result, _error, { flag }) =>
      queryClient.invalidateQueries({ queryKey: keys.roomMessageCollection(roomId, flag) }),
  });
};

export const useToggleReaction = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ messageId, emoji, reacted }: { messageId: string; emoji: string; reacted: boolean }) =>
      client.messages.react(roomId, messageId, emoji, reacted),
    onMutate: async ({ messageId, emoji, reacted }) => {
      const previous = queryClient.getQueryData(keys.messages(roomId));

      // Optimistic: a reaction should feel instant, and the realtime event that
      // follows carries the authoritative list anyway.
      patchMessage(queryClient, keys, roomId, messageId, (message) => ({
        ...message,
        reactions: applyReaction(message.reactions, emoji, reacted),
      }));

      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(keys.messages(roomId), context.previous);
    },
  });
};

export interface UploadFileInput {
  file: File;
  /** Caption shown under the file, kept apart from the message's own text. */
  description?: string;
  /** The composer's text, which rides along with the first file of a batch. */
  text?: string;
  threadId?: string;
  /** Cancels the request when the tile is taken back mid-flight. */
  signal?: AbortSignal;
  /** Bytes reaching the gateway, for the tile that is showing the wait. */
  onProgress?: (progress: UploadProgress) => void;
}

/**
 * Posting one file.
 *
 * Rocket.Chat's upload endpoint takes a single file per request, so a batch is
 * a run of these. The message the server makes of it comes back in the
 * response and is folded into the cache here, exactly as a sent message is:
 * waiting for the realtime echo instead would leave the file invisible until
 * something else refreshed the room, which is not what "uploaded" should look
 * like. The echo lands on the same id and `upsertMessage` is idempotent, so
 * arriving twice costs nothing.
 */
export const useUploadFile = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ file, description, text, threadId, signal, onProgress }: UploadFileInput) =>
      client.files.upload(roomId, file, {
        ...(description ? { description } : {}),
        ...(text ? { text } : {}),
        ...(threadId ? { threadId } : {}),
        ...(signal ? { signal } : {}),
        ...(onProgress ? { onProgress } : {}),
      }),
    // The composer reports the failure against the tray that still holds the
    // file, which is where the retry is.
    meta: { silentError: true },
    onSuccess: (message) => upsertMessage(queryClient, keys, roomId, message),
  });
};

const applyReaction = (reactions: Message['reactions'], emoji: string, reacted: boolean): Message['reactions'] => {
  const existing = reactions.find((reaction) => reaction.emoji === emoji);

  if (!existing) {
    return reacted ? [...reactions, { emoji, usernames: [], count: 1, reactedByMe: true }] : reactions;
  }

  const count = Math.max(0, existing.count + (reacted ? 1 : -1));
  if (count === 0) return reactions.filter((reaction) => reaction.emoji !== emoji);

  return reactions.map((reaction) =>
    reaction.emoji === emoji ? { ...reaction, count, reactedByMe: reacted } : reaction,
  );
};

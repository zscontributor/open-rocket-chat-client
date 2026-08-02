import type {
  FileTypeGroup,
  Message,
  RoomFile,
  RoomMemberRole,
  UpdateRoomNotificationsRequest,
  UserSummary,
} from '@open-rocket-chat/client-sdk';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useClient, useServerKeys } from '@/features/servers/server-scope';

/** How many rows each panel asks for at a time. */
const PAGE_SIZE = 30;

/**
 * Waits for the typing to stop before the value is used as a query key.
 *
 * Without it every keystroke in a member or file search is a request, and the
 * answers arrive out of order — the list then settles on whichever response was
 * slowest rather than on what was typed last.
 */
export const useDebounced = <T>(value: T, delayMs = 350): T => {
  const [settled, setSettled] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return settled;
};

/** Turns an offset-paginated response into the cursor TanStack Query wants. */
const nextOffset = (lastPage: { offset: number; limit: number; total: number }): number | undefined => {
  const consumed = lastPage.offset + lastPage.limit;
  return consumed >= lastPage.total ? undefined : consumed;
};

export const useRoomMemberPage = (roomId: string, options: { q: string; onlineOnly: boolean }) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.roomMembersFiltered(roomId, options),
    queryFn: ({ pageParam }) =>
      client.rooms.members(roomId, {
        offset: pageParam,
        limit: PAGE_SIZE,
        ...(options.q ? { q: options.q } : {}),
        onlineOnly: options.onlineOnly,
      }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: (data) => ({
      members: data.pages.flatMap((page) => page.items),
      total: data.pages.at(-1)?.total ?? 0,
    }),
  });
};

/**
 * Room roles and mute flags, keyed by user id.
 *
 * Fetched once for the whole room rather than per member row, and shaped into a
 * lookup here so neither the list nor the profile panel has to scan an array
 * for every render.
 */
export const useRoomRoles = (roomId: string, enabled = true) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.roomRoles(roomId),
    queryFn: () => client.rooms.roles(roomId),
    enabled,
    staleTime: 60_000,
    select: (response) => {
      const byUserId = new Map<string, { roles: RoomMemberRole[]; muted: boolean }>();
      const byUsername = new Map<string, { roles: RoomMemberRole[]; muted: boolean }>();

      for (const entry of response.items) {
        const value = { roles: entry.roles, muted: entry.muted };
        // Someone silenced without holding a role is keyed by name only: the
        // room's mute list stores usernames, not ids.
        if (entry.userId) byUserId.set(entry.userId, value);
        if (entry.username) byUsername.set(entry.username, value);
      }

      return { byUserId, byUsername };
    },
  });
};

export const useRoomFiles = (roomId: string, options: { q: string; type: FileTypeGroup | 'all' }) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.roomFilesFiltered(roomId, options),
    queryFn: ({ pageParam }) =>
      client.rooms.files(roomId, {
        offset: pageParam,
        limit: PAGE_SIZE,
        ...(options.q ? { q: options.q } : {}),
        ...(options.type === 'all' ? {} : { type: options.type }),
      }),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: (data) => ({
      files: data.pages.flatMap((page) => page.items) as RoomFile[],
      total: data.pages.at(-1)?.total ?? 0,
    }),
  });
};

export type MessageCollection = 'pinned' | 'starred' | 'mentions';

/** The pinned, starred and mentioned lists; one hook because one shape. */
export const useMessageCollection = (roomId: string, kind: MessageCollection) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.roomMessageCollection(roomId, kind),
    queryFn: ({ pageParam }) => client.messages[kind](roomId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: (data) => ({
      messages: data.pages.flatMap((page) => page.items) as Message[],
      total: data.pages.at(-1)?.total ?? 0,
    }),
  });
};

export const useRoomThreads = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();

  return useInfiniteQuery({
    queryKey: keys.roomThreads(roomId),
    queryFn: ({ pageParam }) => client.messages.threads(roomId, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: nextOffset,
    select: (data) => ({
      threads: data.pages.flatMap((page) => page.items) as Message[],
      total: data.pages.at(-1)?.total ?? 0,
    }),
  });
};

/** Searching an empty term would ask the server for the whole room. */
export const useMessageSearch = (roomId: string, term: string) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.roomSearch(roomId, term),
    queryFn: () => client.messages.search(roomId, term, 50),
    enabled: term.trim().length > 0,
    select: (response) => response.items,
  });
};

export const useUserProfile = (userId: string | undefined) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.user(userId ?? ''),
    queryFn: () => client.users.get(userId as string),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });
};

/**
 * Users matching `term`.
 *
 * `allowEmpty` opts into the empty-term call, which Rocket.Chat answers with the
 * caller's direct-message contacts first — a useful starting list for a picker,
 * but wasted work for a panel that shows nothing until the user types.
 */
export const useUserSearch = (term: string, { limit = 20, allowEmpty = false } = {}) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.userSearch(term, limit),
    queryFn: () => client.users.search(term, limit),
    enabled: allowEmpty || term.trim().length > 0,
    select: (response) => response.items as UserSummary[],
  });
};

export const useRoomNotifications = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.roomNotifications(roomId),
    queryFn: () => client.rooms.notifications(roomId),
  });
};

export const useUpdateRoomNotifications = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (changes: UpdateRoomNotificationsRequest) => client.rooms.updateNotifications(roomId, changes),
    // The panel shows the reason under the control that was just toggled.
    meta: { silentError: true },
    // The gateway returns the merged result, so the cache is set from the
    // server's answer rather than from what was sent — the two differ whenever
    // another client changed something in between.
    onSuccess: (preferences) => queryClient.setQueryData(keys.roomNotifications(roomId), preferences),
  });
};

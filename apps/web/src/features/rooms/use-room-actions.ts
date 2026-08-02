import type { CreateRoomRequest, RoomSummary, UpdateRoomRequest } from '@open-rocket-chat/client-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useClient, useServerKeys } from '@/features/servers/server-scope';
import type { MutationSurface } from '@/lib/query';
import { refetchOnStaleSubscription } from './stale-subscription';
import { patchRoom } from './use-rooms';

/** Removes the room from the sidebar without leaving it. */
export const useHideRoom = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => client.rooms.updateState(roomId, { hidden: true }),
    onError: (error) => refetchOnStaleSubscription(queryClient, keys, error),
    onSuccess: (_room, roomId) => {
      // A hidden room is gone from this list until it is reopened, so it is
      // dropped rather than patched.
      queryClient.setQueryData<{ items: RoomSummary[] }>(keys.rooms, (current) =>
        current ? { ...current, items: current.items.filter((room) => room.id !== roomId) } : current,
      );
    },
  });
};

export const useMarkRoomUnread = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => client.rooms.markUnread(roomId),
    onError: (error) => refetchOnStaleSubscription(queryClient, keys, error),
    onSuccess: (_result, roomId) => {
      // Rocket.Chat recomputes the real count from the first unread message;
      // showing 1 immediately is close enough until the realtime event lands.
      patchRoom(queryClient, keys, roomId, (room) => ({
        ...room,
        unreadCount: Math.max(room.unreadCount, 1),
        hasUnreadActivity: true,
      }));
    },
  });
};

export const useLeaveRoom = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => client.rooms.leave(roomId),
    // Refused because the membership is already gone — the row should go with
    // it, which is what the user was asking for anyway.
    onError: (error) => refetchOnStaleSubscription(queryClient, keys, error),
    onSuccess: (_result, roomId) => {
      queryClient.setQueryData<{ items: RoomSummary[] }>(keys.rooms, (current) =>
        current ? { ...current, items: current.items.filter((room) => room.id !== roomId) } : current,
      );
      queryClient.removeQueries({ queryKey: keys.room(roomId) });
    },
  });
};

export const useCreateRoom = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CreateRoomRequest) => client.rooms.create(input),
    // Only ever submitted from the create drawer, which shows the reason above
    // its own submit button.
    meta: { silentError: true },
    onSuccess: () => {
      // The new room arrives with subscription state attached, which only the
      // list endpoint assembles — so refetch rather than splice it in.
      void queryClient.invalidateQueries({ queryKey: keys.rooms });
    },
  });
};

/**
 * Opens — or reopens — the conversation with one person.
 *
 * `surface` exists because this is reached from two very different places: the
 * create drawer, which has room for the reason beside its submit button, and a
 * user card or profile panel, where a bare button press must produce a toast or
 * nothing happens at all. Rocket.Chat refuses this call outright when direct
 * messages are disabled server-side, so the silent path was a dead button.
 */
export const useCreateDirectRoom = (surface: MutationSurface = {}) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (username: string) => client.rooms.createDirect(username),
    meta: surface,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.rooms });
    },
  });
};

export const useUpdateRoom = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roomId, changes }: { roomId: string; changes: UpdateRoomRequest }) =>
      client.rooms.update(roomId, changes),
    // Submitted from the edit form, which renders the reason itself.
    meta: { silentError: true },
    onSuccess: (room) => {
      queryClient.setQueryData(keys.room(room.id), room);
      patchRoom(queryClient, keys, room.id, () => room);
    },
  });
};

import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { canCreateRoom, useCapabilities } from '@/features/server/use-capabilities';
import { useClient, useServerKeys } from '@/features/servers/server-scope';
import type { ServerKeys } from '@/lib/query';
import { refetchOnStaleSubscription } from './stale-subscription';

export const useRooms = (enabled: boolean) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.rooms,
    queryFn: () => client.rooms.list(),
    enabled,
    select: (response) => response.items,
  });
};

/**
 * Whether a conversation with this person may be opened.
 *
 * Mirrors `useGoToDirectMessage`: `create-d` opens a new conversation, but an
 * existing subscription is enough on its own — a server can withdraw the
 * permission without cutting people off from the conversations they already
 * have. `undefined` while the room list is still loading, so callers can wait
 * rather than briefly hide an action they are allowed to take.
 */
export const useCanOpenDirectMessage = (username: string | undefined): boolean | undefined => {
  const { data: capabilities } = useCapabilities();
  const { data: rooms } = useRooms(true);

  if (!rooms) return undefined;
  if (canCreateRoom(capabilities, 'direct')) return true;

  return rooms.some(
    (room) => room.type === 'direct' && room.directMembers.some((member) => member.username === username),
  );
};

export const useRoom = (roomId: string | undefined) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.room(roomId ?? ''),
    queryFn: () => client.rooms.get(roomId as string),
    enabled: Boolean(roomId),
  });
};

/** Members shown in the header stack and the info panel. */
export const useRoomMembers = (roomId: string | undefined, limit = 30) => {
  const client = useClient();
  const keys = useServerKeys();

  return useQuery({
    queryKey: keys.roomMembers(roomId ?? ''),
    queryFn: () => client.rooms.members(roomId as string, { limit }),
    enabled: Boolean(roomId),
    // Membership changes rarely; refetching it on every room switch is waste.
    staleTime: 5 * 60_000,
    select: (response) => response.items,
  });
};

export const useMarkRoomRead = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (roomId: string) => client.rooms.markRead(roomId),
    // Fired on every room open, not only from the menu. A toast here would
    // interrupt someone who never asked for it, about a badge that simply
    // stays where it was.
    meta: { silentError: true },
    // Opening a room the user was removed from is the likeliest way to meet a
    // stale row, and this is the first call that room makes.
    onError: (error) => refetchOnStaleSubscription(queryClient, keys, error),
    onSuccess: (_result, roomId) => {
      // Clear the badge immediately; the authoritative counts arrive shortly
      // afterwards on the `room.updated` realtime event.
      patchRoom(queryClient, keys, roomId, (room) => ({
        ...room,
        unreadCount: 0,
        userMentionsCount: 0,
        groupMentionsCount: 0,
        hasUnreadActivity: false,
      }));
    },
  });
};

export const useToggleFavorite = () => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ roomId, favorite }: { roomId: string; favorite: boolean }) =>
      client.rooms.updateState(roomId, { favorite }),
    onMutate: async ({ roomId, favorite }) => {
      const previous = queryClient.getQueryData(keys.rooms);
      patchRoom(queryClient, keys, roomId, (room) => ({ ...room, favorite }));
      return { previous };
    },
    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(keys.rooms, context.previous);
      // After the rollback, or the restored list would be written back over the
      // refetch it triggers.
      refetchOnStaleSubscription(queryClient, keys, error);
    },
  });
};

/**
 * Applies an update to one room inside the cached sidebar list.
 *
 * Takes the key set rather than a server id so realtime handlers, which act on
 * whichever server an event arrived from, can reuse it.
 */
export const patchRoom = (
  queryClient: ReturnType<typeof useQueryClient>,
  keys: ServerKeys,
  roomId: string,
  update: (room: RoomSummary) => RoomSummary,
): void => {
  queryClient.setQueryData<{ items: RoomSummary[]; removedRoomIds: string[]; syncedAt: string }>(
    keys.rooms,
    (current) => {
      if (!current) return current;
      return {
        ...current,
        items: current.items.map((room) => (room.id === roomId ? update(room) : room)),
      };
    },
  );
};

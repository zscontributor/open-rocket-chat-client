import type { Session } from '@open-rocket-chat/client-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { withUpdatedProfile } from '@/features/auth/status';
import { patchRoom } from '@/features/rooms/use-rooms';
import { useClient, useServerId, useServerKeys } from '@/features/servers/server-scope';
import { queryKeys, serverKeys } from '@/lib/query';

/**
 * Sets the signed-in user's picture on the active server, or clears it when
 * called with `null`.
 *
 * One mutation for both because they are the same decision made two ways — the
 * caller is a single control that either has a file or is being emptied — and
 * splitting them would leave two pending flags for one button.
 *
 * The gateway answers with the profile as it stands afterwards, and that is
 * what lands in the cache. Nothing optimistic: the new picture is addressed by
 * a tag Rocket.Chat mints on write, so there is no URL to guess at, and a
 * guessed one would show the picture that was just replaced.
 */
export const useUpdateMyAvatar = () => {
  const queryClient = useQueryClient();
  const client = useClient();
  const serverId = useServerId();

  return useMutation({
    mutationFn: (image: File | null) => (image ? client.users.setMyAvatar(image) : client.users.resetMyAvatar()),
    // Fired from a field that renders the reason beside itself.
    meta: { silentError: true },
    onSuccess: (profile) => {
      queryClient.setQueryData<Session | null>(
        queryKeys.session,
        (session) => withUpdatedProfile(session, serverId, profile) ?? null,
      );

      // The same profile backs the user card and the user info panel, which
      // would otherwise go on showing the old picture until they refetch.
      queryClient.setQueryData(serverKeys(serverId).user(profile.id), profile);
    },
  });
};

/**
 * Sets a room's picture, or clears it when called with `null`.
 *
 * Every list that names the room is patched from the response rather than
 * invalidated: the sidebar row, the header and the info panel all draw the same
 * avatar, and refetching the whole room list to change one picture would blank
 * them in turn.
 */
export const useUpdateRoomAvatar = (roomId: string) => {
  const queryClient = useQueryClient();
  const client = useClient();
  const keys = useServerKeys();

  return useMutation({
    mutationFn: (image: File | null) =>
      image ? client.rooms.setAvatar(roomId, image) : client.rooms.resetAvatar(roomId),
    meta: { silentError: true },
    onSuccess: (room) => {
      queryClient.setQueryData(keys.room(room.id), room);
      patchRoom(queryClient, keys, room.id, () => room);
    },
  });
};

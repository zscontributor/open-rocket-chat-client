import type { PruneMessagesRequest, UpdateRoomMemberRequest } from '@open-rocket-chat/client-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useClient, useServerKeys } from '@/features/servers/server-scope';
import type { ServerKeys } from '@/lib/query';

/**
 * Refetches everything a membership change invalidates.
 *
 * The member list is paged and filtered, so the affected page cannot be
 * identified — and the room's own record carries `membersCount`, which is now
 * wrong. Invalidating the family is the honest fix; patching one page would
 * leave every other filter stale.
 */
const invalidateMembership = (queryClient: ReturnType<typeof useQueryClient>, keys: ServerKeys, roomId: string) => {
  void queryClient.invalidateQueries({ queryKey: keys.roomMembers(roomId) });
  void queryClient.invalidateQueries({ queryKey: keys.roomRoles(roomId) });
  void queryClient.invalidateQueries({ queryKey: keys.room(roomId), exact: true });
};

export const useAddRoomMembers = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userIds: string[]) => client.rooms.addMembers(roomId, userIds),
    // The panel keeps the failure above its own footer, where the selection
    // that caused it is still on screen.
    meta: { silentError: true },
    onSuccess: () => invalidateMembership(queryClient, keys, roomId),
  });
};

export const useRemoveRoomMember = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (userId: string) => client.rooms.removeMember(roomId, userId),
    onSuccess: () => invalidateMembership(queryClient, keys, roomId),
  });
};

/** Grants or revokes a room role, or silences a member. */
export const useUpdateRoomMember = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ userId, changes }: { userId: string; changes: UpdateRoomMemberRequest }) =>
      client.rooms.updateMember(roomId, userId, changes),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.roomRoles(roomId) });
    },
  });
};

export const usePruneMessages = (roomId: string) => {
  const client = useClient();
  const keys = useServerKeys();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: PruneMessagesRequest) => client.rooms.prune(roomId, request),
    // The panel reports the outcome either way, beside the count it pruned.
    meta: { silentError: true },
    onSuccess: (result) => {
      if (result.count === 0) return;

      // Every list that can contain a deleted message, which is all of them:
      // the timeline, the three collections, threads and the file list.
      void queryClient.invalidateQueries({ queryKey: keys.room(roomId) });
    },
  });
};

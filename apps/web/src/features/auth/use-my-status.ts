import type { Session, UpdateMyStatusRequest } from '@open-rocket-chat/client-sdk';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useClient, useServerId } from '@/features/servers/server-scope';
import { queryKeys, serverKeys } from '@/lib/query';
import { withUpdatedProfile } from './status';

/**
 * Sets the signed-in user's presence and/or status message on the active
 * server.
 *
 * Presence belongs to an account on one Rocket.Chat server rather than to the
 * session, so this deliberately changes only the server the UI is currently
 * looking at — the same way every other action in the app is scoped.
 *
 * The gateway answers with the profile as it stands afterwards, and that is
 * what lands in the cache rather than what was asked for: Rocket.Chat can
 * refuse a presence its settings disallow — invisible can be switched off
 * server-side — and an optimistic write would leave the sidebar claiming a
 * status nobody else can see.
 */
export const useUpdateMyStatus = () => {
  const queryClient = useQueryClient();
  const client = useClient();
  const serverId = useServerId();

  return useMutation({
    mutationFn: (changes: UpdateMyStatusRequest) => client.users.setMyStatus(changes),
    onSuccess: (profile) => {
      queryClient.setQueryData<Session | null>(
        queryKeys.session,
        (session) => withUpdatedProfile(session, serverId, profile) ?? null,
      );

      // The same profile backs the user card and the user info panel; without
      // this they would go on showing the old status until they refetch.
      queryClient.setQueryData(serverKeys(serverId).user(profile.id), profile);
    },
  });
};

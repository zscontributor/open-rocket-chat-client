import type { PresenceStatus, Session, UserProfile } from '@open-rocket-chat/client-sdk';

/**
 * The presences a person can pick for themselves, in the order they are
 * offered.
 *
 * `offline` is Rocket.Chat's "invisible": a deliberate choice to appear away
 * from the app while staying connected, rather than something the server
 * reports about a disconnected client.
 */
export const SELECTABLE_STATUSES: readonly PresenceStatus[] = ['online', 'away', 'busy', 'offline'] as const;

/**
 * The session with one server's profile replaced.
 *
 * The other connections are returned untouched — by identity, not merely by
 * value — because they are the same accounts they were a moment ago, and
 * re-creating them would re-render every consumer of a server nothing happened
 * on.
 */
export const withUpdatedProfile = (
  session: Session | null | undefined,
  serverId: string,
  profile: UserProfile,
): Session | null | undefined => {
  if (!session) return session;

  return {
    ...session,
    connections: session.connections.map((connection) =>
      connection.server.id === serverId ? { ...connection, user: profile } : connection,
    ),
  };
};

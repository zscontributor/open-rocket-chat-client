import type { OpenRocketChatClient, ServerConnection } from '@open-rocket-chat/client-sdk';
import { createContext, use, useMemo, type ReactNode } from 'react';

import { client } from '@/lib/client';
import { serverKeys, type ServerKeys } from '@/lib/query';

interface ServerScopeValue {
  serverId: string;
  /** The session's view of this server: its name, version and the signed-in user. */
  connection: ServerConnection;
  /** An SDK client whose every call is scoped to this server. */
  client: OpenRocketChatClient;
  /** Cache keys under this server, so no component builds one by hand. */
  keys: ServerKeys;
}

const ServerScopeContext = createContext<ServerScopeValue | null>(null);

/**
 * Binds everything below it to one Rocket.Chat server.
 *
 * The scope exists because the app is signed in to several servers at once:
 * without it, every hook would have to be handed a server id, and any hook
 * that forgot would silently read the wrong server's cache.
 */
export const ServerScope = ({ connection, children }: { connection: ServerConnection; children: ReactNode }) => {
  const serverId = connection.server.id;

  const value = useMemo<ServerScopeValue>(
    () => ({
      serverId,
      connection,
      // `forServer` caches per id, so this is the same instance across renders
      // and the query cache never sees a changing client identity.
      client: client.forServer(serverId),
      keys: serverKeys(serverId),
    }),
    [connection, serverId],
  );

  return <ServerScopeContext value={value}>{children}</ServerScopeContext>;
};

const useServerScope = (): ServerScopeValue => {
  const scope = use(ServerScopeContext);

  if (!scope) {
    // Only reachable if a component is mounted outside the signed-in tree.
    throw new Error('useServerScope must be used inside a <ServerScope>');
  }

  return scope;
};

/** The Rocket.Chat server the surrounding UI is working with. */
export const useServerId = (): string => useServerScope().serverId;

/** The signed-in user and server metadata for the active connection. */
export const useServerConnection = (): ServerConnection => useServerScope().connection;

/** An SDK client bound to the active server. Prefer this over importing `client`. */
export const useClient = (): OpenRocketChatClient => useServerScope().client;

/** Cache keys bound to the active server. */
export const useServerKeys = (): ServerKeys => useServerScope().keys;

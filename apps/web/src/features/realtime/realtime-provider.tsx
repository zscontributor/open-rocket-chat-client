import type { RealtimeConnection, RoomSummary } from '@open-rocket-chat/client-sdk';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useEffect, useRef, useState, type ReactNode } from 'react';

import { removeMessage, upsertMessage } from '@/features/messages/message-cache';
import { useServerId } from '@/features/servers/server-scope';
import { client } from '@/lib/client';
import { serverKeys } from '@/lib/query';
import { roomScopeKey, useUiStore } from '@/stores/ui-store';

const RealtimeContext = createContext<RealtimeConnection | null>(null);

interface RoomsCache {
  items: RoomSummary[];
  removedRoomIds: string[];
  syncedAt: string;
}

/**
 * Owns the single realtime connection and folds its events into the query
 * cache. Components read data from React Query only, so they never need to
 * know whether a value arrived over HTTP or over the socket.
 *
 * One socket carries every server the session is signed in to, and each event
 * names the server it came from. Folding it into that server's cache — rather
 * than the one on screen — is what keeps unread counts moving on the servers
 * the user is not currently looking at.
 */
export const RealtimeProvider = ({ enabled, children }: { enabled: boolean; children: ReactNode }) => {
  const queryClient = useQueryClient();
  const setConnectionStatus = useUiStore((state) => state.setConnection);
  const setTyping = useUiStore((state) => state.setTyping);

  // Created once and kept for the provider's lifetime. The effect below only
  // opens and closes the transport, which is why `disconnect()` has to be
  // reversible — StrictMode runs that cleanup on the very first mount.
  const [connection] = useState(() =>
    client.createRealtime({ onStatusChange: (status, info) => setConnectionStatus(status, info.retryAt) }),
  );

  // Keeps the effect from re-subscribing when only these identities change.
  // Refreshed from an effect rather than during render, which React forbids
  // because a discarded render would leave the ref pointing at values that
  // were never committed.
  const handlers = useRef({ queryClient, setTyping });
  useEffect(() => {
    handlers.current = { queryClient, setTyping };
  });

  useEffect(() => {
    if (!enabled) return;

    connection.connect();

    const unsubscribes = [
      // Pinning and uploading are both broadcast as plain message changes, and
      // whether one lands as `created` or `updated` depends only on how long ago
      // the message was posted — so the two handlers have to be equivalent.
      // `upsertMessage` carries the Pinned, Starred and Files panels with it.
      connection.on('message.created', (event) => {
        upsertMessage(handlers.current.queryClient, serverKeys(event.serverId), event.roomId, event.message);
      }),

      connection.on('message.updated', (event) => {
        upsertMessage(handlers.current.queryClient, serverKeys(event.serverId), event.roomId, event.message);
      }),

      connection.on('message.deleted', (event) => {
        removeMessage(handlers.current.queryClient, serverKeys(event.serverId), event.roomId, event.messageId);
      }),

      connection.on('room.updated', (event) => {
        const keys = serverKeys(event.serverId);

        handlers.current.queryClient.setQueryData(keys.room(event.room.id), event.room);
        handlers.current.queryClient.setQueryData<RoomsCache>(keys.rooms, (current) => {
          if (!current) return current;

          const exists = current.items.some((room) => room.id === event.room.id);
          return {
            ...current,
            items: exists
              ? current.items.map((room) => (room.id === event.room.id ? event.room : room))
              : [event.room, ...current.items],
          };
        });
      }),

      connection.on('room.removed', (event) => {
        handlers.current.queryClient.setQueryData<RoomsCache>(serverKeys(event.serverId).rooms, (current) => {
          if (!current) return current;
          return { ...current, items: current.items.filter((room) => room.id !== event.roomId) };
        });
      }),

      connection.on('typing.changed', (event) => {
        handlers.current.setTyping(roomScopeKey(event.serverId, event.roomId), event.username, event.typing);
      }),

      connection.on('connection.ready', (event) => {
        // Events produced while the socket was down are not replayed, so the
        // only safe assumption after reconnecting is that the cache is stale.
        // One ready event arrives per server, so only that server refetches.
        void handlers.current.queryClient.invalidateQueries({ queryKey: serverKeys(event.serverId).rooms });
      }),
    ];

    return () => {
      for (const unsubscribe of unsubscribes) unsubscribe();
      connection.disconnect();
    };
  }, [connection, enabled]);

  // The transport follows the browser's own view of the network.
  //
  // Losing connectivity does not close a socket that is sitting idle: no
  // packets are exchanged, so nothing fails, and the app goes on reporting
  // itself connected while no event can possibly arrive. Dropping it here is
  // what makes that state visible — and honest, since the connection really is
  // gone. Coming back is the mirror image: a laptop that just woke would
  // otherwise sit out the rest of a backoff already stretched to fifteen
  // seconds, when the event says this is exactly the moment worth trying.
  useEffect(() => {
    if (!enabled) return;

    const drop = () => connection.disconnect();
    const retryNow = () => connection.reconnect();

    window.addEventListener('offline', drop);
    window.addEventListener('online', retryNow);
    return () => {
      window.removeEventListener('offline', drop);
      window.removeEventListener('online', retryNow);
    };
  }, [connection, enabled]);

  // Note there is deliberately no `close()` on unmount. React runs the cleanup
  // of *every* effect before re-running any of them, so a second effect calling
  // `close()` would retire the connection during StrictMode's double-invoke —
  // before the setup above got its second run — and realtime would never start.
  // `disconnect()` already releases the socket, and the instance itself is
  // collected with the component.

  return <RealtimeContext value={connection}>{children}</RealtimeContext>;
};

export const useRealtime = (): RealtimeConnection | null => use(RealtimeContext);

/** Subscribes to a room's events on the active server for as long as it is open. */
export const useRoomSubscription = (roomId: string | undefined): void => {
  const connection = useRealtime();
  const serverId = useServerId();

  useEffect(() => {
    if (!connection || !roomId) return;
    return connection.subscribeRoom(serverId, roomId);
  }, [connection, serverId, roomId]);
};

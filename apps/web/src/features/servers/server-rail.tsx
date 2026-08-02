import type { RoomSummary, ServerConnection } from '@open-rocket-chat/client-sdk';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Tooltip from '@radix-ui/react-tooltip';
import { useQueries } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useLogout, useServers } from '@/features/auth/use-session';
import { aggregateUnread, unreadLabel, type UnreadSummary } from '@/features/rooms/unread';
import { client } from '@/lib/client';
import { cn } from '@/lib/cn';
import { serverKeys } from '@/lib/query';
import { SERVER_RAIL_WIDTH } from '@/lib/resize';
import { useUiStore } from '@/stores/ui-store';
import { Icons } from '@/ui/icon';
import { UnreadBadge } from '@/ui/unread-badge';
import { useServerStore } from './server-store';

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-sunken';

/** Two letters is enough to tell servers apart, and always fits the tile. */
const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('') || '?';

interface RoomsCache {
  items: RoomSummary[];
}

/** Everything unread on one server, whether or not that server is on screen. */
const unreadOf = (rooms: RoomsCache | undefined): UnreadSummary => aggregateUnread(rooms?.items ?? []);

/**
 * One server in the rail.
 *
 * Left click switches to it; right click opens its menu, the way every other
 * server rail behaves. Radix would open the menu on left click too, so its
 * default is suppressed and the menu is driven from state instead.
 */
const ServerTile = ({
  connection,
  isActive,
  unread,
  onSelect,
  onDisconnect,
  disconnecting,
}: {
  connection: ServerConnection;
  isActive: boolean;
  unread: UnreadSummary;
  onSelect: () => void;
  onDisconnect: () => void;
  disconnecting: boolean;
}) => {
  const { t } = useTranslation('servers');
  // The badge's own wording lives with the rooms it counts, so the sidebar and
  // the rail cannot end up describing the same number two different ways.
  const { t: tRooms } = useTranslation('rooms');
  const [menuOpen, setMenuOpen] = useState(false);
  const { name } = connection.server;

  return (
    <DropdownMenu.Root open={menuOpen} onOpenChange={setMenuOpen}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={t('rail.switchTo', { name })}
              aria-current={isActive ? 'true' : undefined}
              // Radix composes its handlers after ours and skips them once the
              // event is defaulted-prevented, which is what keeps a plain
              // click from opening the menu instead of switching servers.
              onPointerDown={(event) => event.preventDefault()}
              onClick={onSelect}
              onContextMenu={(event) => {
                event.preventDefault();
                setMenuOpen(true);
              }}
              className={cn(
                'relative flex size-10 items-center justify-center rounded-xl text-sm font-semibold transition-colors',
                isActive
                  ? 'bg-accent text-accent-content'
                  : 'bg-panel text-content-muted hover:text-content hover:bg-line/60',
              )}
            >
              {initialsOf(name)}

              {/*
               * Everything unread on the server, added up — a tile is the only
               * thing standing in for that server while another one is open,
               * so it has to say how much is waiting rather than merely that
               * something is. Mentions colour it, as they do in the room list.
               *
               * The ring is the rail's own background, which cuts the badge out
               * of the tile instead of letting it sit on the corner glyph.
               */}
              {unread.showBadge ? (
                <UnreadBadge
                  count={unread.total}
                  mention={unread.mentions > 0}
                  label={unreadLabel(unread, tRooms)}
                  className="ring-sunken absolute -top-1 -right-1 ring-2"
                />
              ) : unread.highlight ? (
                // Rooms marked unread by hand carry no count of their own.
                <span className="bg-accent ring-sunken absolute -top-0.5 -right-0.5 size-2.5 rounded-full ring-2" />
              ) : null}
            </button>
          </DropdownMenu.Trigger>
        </Tooltip.Trigger>

        <Tooltip.Portal>
          <Tooltip.Content
            side="right"
            sideOffset={8}
            className="bg-panel border-line text-content z-50 rounded-md border px-2 py-1 text-xs shadow-md"
          >
            {name}
            {/* The badge is two digits at most; this is where the number gets
                to say what it is counting. */}
            {unread.showBadge ? <span className="text-content-muted"> · {unreadLabel(unread, tRooms)}</span> : null}
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          side="right"
          align="start"
          sideOffset={8}
          className="bg-panel border-line z-50 min-w-52 rounded-lg border p-1 shadow-lg"
        >
          <DropdownMenu.Label className="text-content-muted px-2 py-1.5 text-xs">
            {t('menu.connectedAs', { username: connection.user.username })}
          </DropdownMenu.Label>

          <DropdownMenu.Item className={cn(itemClass, 'text-danger')} onSelect={onDisconnect} disabled={disconnecting}>
            <Icons.signOut size={16} />
            {t('menu.disconnect', { name })}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
};

/**
 * The strip of connected servers down the left edge.
 *
 * Rooms are fetched for *every* connected server, not just the active one:
 * that is what puts an unread badge on a server the user is not looking at,
 * and it means switching shows the room list immediately instead of a spinner.
 * The realtime socket keeps all of them current.
 */
export const ServerRail = ({
  connections,
  activeServerId,
  onSelect,
}: {
  connections: readonly ServerConnection[];
  activeServerId: string;
  onSelect: (serverId: string) => void;
}) => {
  const { t } = useTranslation('servers');
  const setAddingServer = useServerStore((state) => state.setAddingServer);
  const setRailWidth = useUiStore((state) => state.setServerRailWidth);
  const logout = useLogout();
  const { data: available } = useServers();

  const rooms = useQueries({
    queries: connections.map((connection) => ({
      queryKey: serverKeys(connection.server.id).rooms,
      queryFn: () => client.forServer(connection.server.id).rooms.list(),
      // The active server's own hook uses the same key, so this never doubles
      // the request — TanStack Query dedupes on the key.
      staleTime: 30_000,
    })),
  });

  // A gateway fronting a single server has nothing to switch between and
  // nothing to add, so the rail would only take width from the room list. It
  // does stay visible with one connection out of several, because that is
  // where the "add a server" button lives.
  const offered = available?.servers.length ?? 0;
  const shown = connections.length > 1 || offered > 1;

  // The width the rail takes is width the room list and the conversation do not
  // get, and they are sized from the store rather than from the DOM — so what
  // is spent here has to be said out loud.
  useEffect(() => {
    setRailWidth(shown ? SERVER_RAIL_WIDTH : 0);
  }, [shown, setRailWidth]);

  if (!shown) return null;

  return (
    <Tooltip.Provider delayDuration={300}>
      <nav
        aria-label={t('rail.label')}
        style={{ width: SERVER_RAIL_WIDTH }}
        className="bg-sunken border-line flex shrink-0 flex-col items-center gap-2 border-r py-3"
      >
        {connections.map((connection, index) => (
          <ServerTile
            key={connection.server.id}
            connection={connection}
            isActive={connection.server.id === activeServerId}
            unread={unreadOf(rooms[index]?.data as RoomsCache | undefined)}
            onSelect={() => onSelect(connection.server.id)}
            onDisconnect={() => logout.mutate(connection.server.id)}
            disconnecting={logout.isPending}
          />
        ))}

        <Tooltip.Root>
          <Tooltip.Trigger asChild>
            <button
              type="button"
              aria-label={t('rail.add')}
              onClick={() => setAddingServer(true)}
              className="text-content-muted hover:text-content hover:bg-line/60 border-line flex size-10 items-center justify-center rounded-xl border border-dashed transition-colors"
            >
              <Icons.add size={18} />
            </button>
          </Tooltip.Trigger>

          <Tooltip.Portal>
            <Tooltip.Content
              side="right"
              sideOffset={8}
              className="bg-panel border-line text-content z-50 rounded-md border px-2 py-1 text-xs shadow-md"
            >
              {t('rail.add')}
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
      </nav>
    </Tooltip.Provider>
  );
};

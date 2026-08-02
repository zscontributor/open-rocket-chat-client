import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useSession } from '@/features/auth/use-session';
import { UserMenu } from '@/features/auth/user-menu';
import { showFeatureNotice } from '@/features/server/feature-notice-store';
import { canCreateAnyRoom, useCapabilities } from '@/features/server/use-capabilities';
import { useServerConnection } from '@/features/servers/server-scope';
import { useThemeStore } from '@/features/theme/theme-store';
import { cn } from '@/lib/cn';
import { hasModifier } from '@/lib/keys';
import { layoutWidth, sidebarBounds } from '@/lib/resize';
import { useUiStore } from '@/stores/ui-store';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { Input } from '@/ui/input';
import { ResizeHandle } from '@/ui/resize-handle';
import { UnreadBadge } from '@/ui/unread-badge';
import { RoomActionsMenu } from './room-actions-menu';
import { useRoomDrawerStore } from './room-drawer-store';
import { unreadLabel, unreadSummary } from './unread';
import { useRooms, useToggleFavorite } from './use-rooms';

/** Direct-message lists get long; the rest is one click away. */
const COLLAPSED_DIRECT_LIMIT = 5;

/**
 * What the sidebar shrinks to when collapsed: the mark and the reopen arrow
 * side by side, at the same left offset they have in the expanded header.
 */
const RAIL_WIDTH = 64;

/**
 * The app mark. Shared by the header and the collapsed rail so the logo keeps
 * its place — and its size — through the collapse animation.
 *
 * The variant follows the theme store's resolved scheme rather than a CSS media
 * query: the user can pick a scheme that disagrees with their OS, and only the
 * store knows which one actually won. Decorative — the server name beside it in
 * the header, and the button's own label in the rail, carry the meaning.
 */
const BrandMark = () => {
  const scheme = useThemeStore((state) => state.resolvedScheme);

  return (
    <img
      src={scheme === 'dark' ? '/logo-dark.svg' : '/logo-light.svg'}
      alt=""
      width={28}
      height={28}
      draggable={false}
      className="size-7 shrink-0 rounded-lg"
    />
  );
};

const RoomIcon = ({ room }: { room: RoomSummary }) => {
  if (room.type === 'direct') return null;
  if (room.type === 'channel') return <Icons.channel size={16} />;
  return <Icons.private size={16} />;
};

const RoomRow = ({
  room,
  active,
  onSelect,
}: {
  room: RoomSummary;
  active: boolean;
  onSelect: (roomId: string) => void;
}) => {
  const { t } = useTranslation('rooms');
  const toggleFavorite = useToggleFavorite();
  const unread = unreadSummary(room);
  const peer = room.directMembers[0];

  return (
    <div className="group/room relative">
      <button
        type="button"
        onClick={() => onSelect(room.id)}
        aria-current={active ? 'page' : undefined}
        className={cn(
          // The right padding is the slot the badge and the hover actions
          // share; without it a long room name would run underneath both.
          'flex w-full items-center gap-2.5 rounded-lg py-1.5 pr-12 pl-2.5 text-left text-sm transition-colors',
          active ? 'bg-selected text-content-inverted' : 'text-content-secondary hover:bg-sunken hover:text-content',
          // An unread room must read as unread even when it is not selected.
          // Rocket.Chat highlights on its `alert` flag too, so a room marked
          // unread by hand looks unread without carrying a count.
          !active && unread.highlight && 'text-content font-semibold',
        )}
      >
        {room.type === 'direct' ? (
          <Avatar name={room.displayName} src={peer?.avatarUrl} size="xs" status={peer?.status ?? null} />
        ) : room.avatarUrl ? (
          // A room with a picture wears it in place of its type mark. The mark
          // is not lost: the type is still stated in the header and the info
          // panel, and a picture the owner chose says more in a list than a
          // repeated hash.
          <Avatar name={room.displayName} src={room.avatarUrl} size="xs" />
        ) : (
          <span className={cn(active ? 'text-content-inverted' : 'text-content-muted')}>
            <RoomIcon room={room} />
          </span>
        )}

        <span className="flex-1 truncate">{room.displayName}</span>
      </button>

      {/*
       * Badge and actions share one slot on the right, as they do in
       * Rocket.Chat: the count is what the row says at rest, and the actions
       * take its place while the pointer is on the row. One flex row rather
       * than two stacked layers, so nothing can ever be drawn over the count.
       *
       * Pointer events are off for the strip itself so the badge does not
       * carve a dead patch out of the row; each control turns them back on.
       */}
      <div
        className={cn(
          'pointer-events-none absolute top-1/2 right-1 flex -translate-y-1/2 items-center gap-0.5',
          active ? 'text-content-inverted' : 'text-content-muted',
        )}
      >
        {unread.showBadge ? (
          <UnreadBadge
            count={unread.total}
            mention={unread.mentions > 0}
            onSelectedRow={active}
            label={unreadLabel(unread, t)}
            // Only on hover. Tabbing to the row would otherwise take the count
            // away without putting the actions there in its place.
            className="group-hover/room:hidden"
          />
        ) : null}

        <button
          type="button"
          aria-label={room.favorite ? t('action.unfavorite') : t('action.favorite')}
          onClick={() => toggleFavorite.mutate({ roomId: room.id, favorite: !room.favorite })}
          className={cn(
            'hover:bg-line/60 pointer-events-auto rounded p-1 transition-opacity',
            // Revealed on hover or focus so the row stays uncluttered, but
            // still reachable by keyboard.
            room.favorite ? 'opacity-100' : 'opacity-0 group-hover/room:opacity-100 focus-visible:opacity-100',
          )}
        >
          <Icons.star
            size={14}
            weight={room.favorite ? 'fill' : 'light'}
            className={cn(room.favorite ? 'text-warning' : 'text-current')}
          />
        </button>

        <RoomActionsMenu
          room={room}
          className="pointer-events-auto opacity-0 group-hover/room:opacity-100 focus-visible:opacity-100"
        />
      </div>
    </div>
  );
};

const Section = ({
  title,
  children,
  onAdd,
  addLabel,
}: {
  title: string;
  children: React.ReactNode;
  onAdd?: () => void;
  addLabel?: string;
}) => (
  <section className="mb-4">
    <div className="flex items-center justify-between px-2.5 py-1">
      <h2 className="text-content-muted text-xs font-semibold">{title}</h2>
      {onAdd ? (
        <button
          type="button"
          aria-label={addLabel}
          onClick={onAdd}
          className="text-content-muted hover:bg-sunken hover:text-content rounded p-0.5 transition-colors"
        >
          <Icons.add size={14} />
        </button>
      ) : null}
    </div>
    <div className="space-y-0.5">{children}</div>
  </section>
);

export const Sidebar = ({
  activeRoomId,
  onSelectRoom,
  onOpenSettings,
}: {
  activeRoomId: string | undefined;
  onSelectRoom: (roomId: string) => void;
  onOpenSettings: () => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');
  const { t: tSettings } = useTranslation('settings');
  const { data: session } = useSession();
  const { server } = useServerConnection();
  const { data: rooms, isLoading } = useRooms(Boolean(session));
  const open = useUiStore((state) => state.sidebarOpen);
  const viewportIsMobile = useUiStore((state) => state.viewportIsMobile);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);
  const setSidebarOpen = useUiStore((state) => state.setSidebarOpen);
  const openDrawer = useRoomDrawerStore((state) => state.openRoomDrawer);
  const { data: capabilities } = useCapabilities(Boolean(session));
  // Rocket.Chat removes its "Create new" menu when the user holds none of the
  // create permissions. The button stays here and says why instead, so the
  // absence reads as a server decision rather than a missing feature.
  // `!capabilities` means they are still loading, not that nothing is allowed:
  // the drawer waits for them itself, so defer to it rather than refuse.
  const openCreate = () =>
    !capabilities || canCreateAnyRoom(capabilities) ? openDrawer({ mode: 'create' }) : showFeatureNotice('createRoom');
  const width = useUiStore((state) => state.sidebarWidth);
  const setWidth = useUiStore((state) => state.setSidebarWidth);
  const resetWidth = useUiStore((state) => state.resetSidebarWidth);
  const serverRailWidth = useUiStore((state) => state.serverRailWidth);
  const bounds = sidebarBounds(layoutWidth(window.innerWidth, serverRailWidth));

  const [filter, setFilter] = useState('');
  const [showAllDirect, setShowAllDirect] = useState(false);
  // A width that animates would lag a pixel or two behind the pointer, so the
  // transition is dropped for the duration of a drag.
  const [isResizing, setResizing] = useState(false);

  const search = useRef<HTMLInputElement>(null);
  /**
   * Bumped by the shortcut rather than focusing from inside its handler: a
   * collapsed sidebar has to be reopened first, and until that render lands the
   * box is still inside an `inert` subtree, where `focus()` is ignored.
   */
  const [focusRequests, setFocusRequests] = useState(0);

  // ⌘K / Ctrl+K, the chord the shortcuts panel advertises. Bound to the window
  // because it has to work from the message box, from a panel, from anywhere —
  // that is the whole point of a shortcut for finding a room.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // `key` is optional on a synthesized KeyboardEvent — password managers and
      // autofill dispatch keydowns without it — so it is read defensively.
      if (event.key?.toLowerCase() !== 'k' || !hasModifier(event) || event.altKey || event.shiftKey) return;

      // Chrome puts its own search on this chord; the app's rooms are what the
      // user is asking for while they are looking at the app.
      event.preventDefault();
      setSidebarOpen(true);
      setFocusRequests((count) => count + 1);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [setSidebarOpen]);

  // Runs after the reopening render has committed, so the box is focusable by
  // then. Selecting the text means a second ⌘K types over the last search
  // instead of appending to it.
  useEffect(() => {
    if (focusRequests === 0 || !open) return;

    search.current?.focus();
    search.current?.select();
  }, [focusRequests, open]);

  const groups = useMemo(() => {
    const term = filter.trim().toLowerCase();
    const visible = (rooms ?? []).filter((room) => !term || room.displayName.toLowerCase().includes(term));

    return {
      favorites: visible.filter((room) => room.favorite),
      // Direct messages are addressed by person rather than by topic, so users
      // look for them differently.
      direct: visible.filter((room) => !room.favorite && room.type === 'direct'),
      channels: visible.filter((room) => !room.favorite && room.type !== 'direct'),
      total: visible.length,
    };
  }, [rooms, filter]);

  const directToShow = showAllDirect ? groups.direct : groups.direct.slice(0, COLLAPSED_DIRECT_LIMIT);

  /**
   * On a phone the panel floats over the conversation instead of taking width
   * from it: at this size there is not enough room for both, and pushing the
   * messages off screen is worse than covering them for as long as the list is
   * being read. The rail keeps its place in the flow underneath, so opening and
   * closing the list does not shift the room around it.
   *
   * The drawer layout is held whether it is open or shut — it fades rather than
   * mounts, for the same reason the sidebar itself is never unmounted.
   */
  const drawer = viewportIsMobile;

  return (
    <aside
      style={{ width: open && !drawer ? width : RAIL_WIDTH }}
      className={cn(
        'bg-sidebar border-line relative h-full shrink-0 border-r',
        // Off while dragging, and off entirely for anyone who has asked the
        // system for less motion.
        !isResizing && 'transition-[width] duration-200 ease-out motion-reduce:transition-none',
      )}
    >
      {/*
       * The rail. It cross-fades with the panel rather than replacing it, so
       * collapsing reads as one movement instead of a swap. The mark stays on
       * at the same size and offset as in the header, which is what makes the
       * collapsed strip still read as this app rather than an empty gutter.
       */}
      <button
        type="button"
        inert={open}
        aria-label={t('action.expandSidebar')}
        onClick={toggleSidebar}
        style={{ width: RAIL_WIDTH }}
        className={cn(
          'group/rail text-content-muted absolute top-0 left-0 z-10 flex h-full items-start',
          // `pl-3` and `pt-3.5` are the header's own padding, so the mark does
          // not shift at all as the two layers cross-fade.
          'gap-0.5 pt-3.5 pl-3 transition-opacity duration-200 motion-reduce:transition-none',
          // `inert` already takes it out of hit testing; the explicit
          // pointer-events keeps the room rows underneath clickable regardless.
          open ? 'pointer-events-none opacity-0' : 'opacity-100',
        )}
      >
        <BrandMark />
        {/* Boxed to the mark's height so the arrow reads as being on its line. */}
        <span className="flex h-7 items-center">
          <Icons.chevronRight size={18} className="group-hover/rail:text-content transition-colors" />
        </span>
      </button>

      {/* Dismisses the drawer by tapping the conversation behind it, which is
          where the thumb goes. Only ever covers a room it is itself hiding. */}
      {drawer ? (
        <button
          type="button"
          inert={!open}
          aria-label={t('action.collapseSidebar')}
          onClick={toggleSidebar}
          className={cn(
            'fixed inset-0 z-20 bg-black/40 transition-opacity duration-200 motion-reduce:transition-none',
            open ? 'opacity-100' : 'pointer-events-none opacity-0',
          )}
        />
      ) : null}

      {/*
       * Held at its full width inside a clipping frame: laying the room list
       * out again at every frame of the animation would reflow every row, and
       * the names would visibly re-wrap on the way out.
       */}
      <div
        style={drawer ? { width } : undefined}
        className={cn(
          'h-full overflow-hidden',
          drawer
            ? // Its own background, because there is a conversation behind it
              // rather than the sidebar it is normally cut out of.
              'bg-sidebar border-line absolute top-0 left-0 z-30 border-r shadow-xl transition-opacity duration-200 motion-reduce:transition-none'
            : 'w-full',
          // Shut, it is still there at full width: `inert` and the pointer
          // rules below are what keep it off the room underneath.
          drawer && !open && 'pointer-events-none opacity-0',
        )}
      >
        <div
          inert={!open}
          style={{ width }}
          className={cn(
            'flex h-full flex-col transition-opacity duration-200 motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <header className="flex items-center gap-2 px-3 py-3.5">
            <BrandMark />
            {/* The server, not the app. This header sits above that server's
                rooms and nothing else, and the app's own name is the one thing
                on screen that is true no matter which server is being read.
                Titled as well as truncated: server names are hostnames often
                enough that the tail is the part that tells them apart. */}
            <span title={server.name} className="text-accent flex-1 truncate text-base font-semibold">
              {server.name}
            </span>
            <button
              type="button"
              aria-label={t('action.collapseSidebar')}
              onClick={toggleSidebar}
              className="text-content-muted hover:bg-sunken hover:text-content rounded-md p-1 transition-colors"
            >
              <Icons.chevronLeft size={18} />
            </button>
          </header>

          <div className="px-2 pb-2">
            <div className="relative">
              <Icons.search
                size={16}
                className="text-content-muted pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2"
              />
              <Input
                ref={search}
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('filter')}
                aria-label={t('filter')}
                className="bg-app h-9 pl-8 text-sm"
              />
            </div>
          </div>

          <nav aria-label={t('nav.rooms')} className="scrollbar-slim flex-1 overflow-y-auto px-2 pb-3">
            {isLoading ? (
              <div className="text-content-muted flex items-center gap-2 px-2 py-4 text-sm">
                <Spinner className="size-4" /> {tCommon('state.loading')}
              </div>
            ) : null}

            {groups.favorites.length > 0 ? (
              <Section title={t('section.favorites')}>
                {groups.favorites.map((room) => (
                  <RoomRow key={room.id} room={room} active={room.id === activeRoomId} onSelect={onSelectRoom} />
                ))}
              </Section>
            ) : null}

            {groups.channels.length > 0 ? (
              <Section title={t('section.channels')} addLabel={tCommon('action.add')} onAdd={openCreate}>
                {groups.channels.map((room) => (
                  <RoomRow key={room.id} room={room} active={room.id === activeRoomId} onSelect={onSelectRoom} />
                ))}
              </Section>
            ) : null}

            {groups.direct.length > 0 ? (
              <Section title={t('section.directMessages')} addLabel={tCommon('action.add')} onAdd={openCreate}>
                {directToShow.map((room) => (
                  <RoomRow key={room.id} room={room} active={room.id === activeRoomId} onSelect={onSelectRoom} />
                ))}

                {groups.direct.length > COLLAPSED_DIRECT_LIMIT ? (
                  <button
                    type="button"
                    onClick={() => setShowAllDirect((shown) => !shown)}
                    className="text-content-muted hover:bg-sunken hover:text-content flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-colors"
                  >
                    <Icons.chevronDown
                      size={16}
                      className={cn('transition-transform', showAllDirect && 'rotate-180')}
                    />
                    {showAllDirect ? t('viewLess') : t('viewMore')}
                  </button>
                ) : null}
              </Section>
            ) : null}

            {!isLoading && groups.total === 0 ? (
              <p className="text-content-muted px-2 py-4 text-sm">
                {filter.trim() ? t('noMatches', { query: filter.trim() }) : t('empty')}
              </p>
            ) : null}
          </nav>

          <footer className="border-line flex items-center gap-2 border-t px-3 py-2.5">
            {/* The account block is a menu rather than a label: presence, the
                status message and signing out all belong to the person named
                here, and this is the only place in the app that names them. */}
            <UserMenu />

            <button
              type="button"
              aria-label={tSettings('title')}
              onClick={onOpenSettings}
              className="text-content-muted hover:bg-sunken hover:text-content rounded-md p-1.5 transition-colors"
            >
              <Icons.settings size={18} />
            </button>
          </footer>
        </div>
      </div>

      {/* Straddles the right border so the whole divider is grabbable. It sits
          outside the clipping frame, or its grip would be cut in half. Gone
          while the list is a drawer: the aside's edge is no longer the panel's,
          and at that viewport there is only one width the list may have. */}
      {open && !drawer ? (
        <ResizeHandle
          axis="x"
          value={width}
          min={bounds.min}
          max={bounds.max}
          label={t('action.resizeSidebar')}
          onResize={setWidth}
          onReset={resetWidth}
          onDragChange={setResizing}
          className="-right-1"
        />
      ) : null}
    </aside>
  );
};

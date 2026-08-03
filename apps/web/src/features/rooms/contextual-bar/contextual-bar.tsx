import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { cn } from '@/lib/cn';
import { useThreadMessages } from '@/features/messages/use-messages';
import { useUiStore } from '@/stores/ui-store';
import { Icons, type IconName } from '@/ui/icon';
import { ResizeHandle } from '@/ui/resize-handle';
import { contextualBarBounds, layoutWidth, SIDEBAR_RAIL_WIDTH } from '@/lib/resize';
import { RoomEditForm } from '../room-edit-form';
import { AddMembersPanel } from './panels/add-members-panel';
import { FilesPanel } from './panels/files-panel';
import { MessageCollectionPanel } from './panels/message-collection-panel';
import { MembersPanel } from './panels/members-panel';
import { NotificationsPanel } from './panels/notifications-panel';
import { PrunePanel } from './panels/prune-panel';
import { RoomInfoPanel } from './panels/room-info-panel';
import { SearchPanel } from './panels/search-panel';
import { ShortcutsPanel } from './panels/shortcuts-panel';
import { ThreadPanel } from './panels/thread-panel';
import { ThreadsPanel } from './panels/threads-panel';
import { UserInfoPanel } from './panels/user-info-panel';
import { useContextualBarOverlay, useContextualBarStore, type ContextualTab } from './store';

/**
 * How long the bar takes to slide shut — the sidebar's `duration-200`, in the
 * number form the unmount timer needs. The two have to agree, or the panel
 * either vanishes mid-animation or lingers after it.
 */
const CLOSE_MS = 200;

const ICON_BY_TAB: Record<ContextualTab['id'], IconName> = {
  'room-info': 'info',
  'room-edit': 'edit',
  members: 'members',
  'add-members': 'addMembers',
  'user-info': 'members',
  files: 'attach',
  pinned: 'pin',
  starred: 'star',
  mentions: 'mention',
  threads: 'threads',
  thread: 'threads',
  search: 'search',
  notifications: 'notifications',
  prune: 'eraser',
  shortcuts: 'keyboard',
};

/**
 * The thread panel's subtitle: whose message is being replied to.
 *
 * Reads the same query the pane below it does, so the parent costs nothing to
 * find here — it arrives with the oldest page of replies. It used to be looked
 * up in the room's timeline cache, which only holds the parent when the window
 * the room happened to load reaches back that far.
 */
const ThreadSubtitle = ({ roomId, threadId }: { roomId: string; threadId: string }) => {
  const { t } = useTranslation('messages');
  const { data } = useThreadMessages(roomId, threadId);
  const parent = data?.messages.find((message) => message.id === threadId);

  if (!parent) return null;
  return <>{t('thread.replyingTo', { name: parent.sender.displayName })}</>;
};

/**
 * Rocket.Chat's contextual bar: one panel at a time, on the right-hand edge.
 *
 * The header is owned here rather than by each panel, so the back button, the
 * close button and the title behave identically everywhere — a panel that drew
 * its own header is a panel that can forget one of the three.
 */
export const ContextualBar = ({
  room,
  roomId,
  onOpenRoom,
}: {
  room: RoomSummary | undefined;
  roomId: string;
  onOpenRoom: (roomId: string) => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const stack = useContextualBarStore((state) => state.stack);
  const back = useContextualBarStore((state) => state.back);
  const close = useContextualBarStore((state) => state.close);

  const width = useUiStore((state) => state.contextualBarWidth);
  const setWidth = useUiStore((state) => state.setContextualBarWidth);
  const resetWidth = useUiStore((state) => state.resetContextualBarWidth);
  const sidebarWidth = useUiStore((state) => state.sidebarWidth);
  const sidebarOpen = useUiStore((state) => state.sidebarOpen);
  const serverRailWidth = useUiStore((state) => state.serverRailWidth);
  const viewportWidth = useUiStore((state) => state.viewportWidth);

  // Too narrow for the bar and the conversation to share the row: the panel
  // floats over the room instead of taking width from it.
  const overlay = useContextualBarOverlay();

  // A width that animates would lag behind the pointer, so the transition is
  // dropped for the duration of a drag — as on the sidebar.
  const [isResizing, setResizing] = useState(false);

  const tab = stack.at(-1);
  const open = tab !== undefined;

  // The panel the bar is closing on, held back so it can animate out: dropping
  // it the instant the stack empties would slide an empty box shut. Released
  // once the animation is over, so a closed bar costs nothing — no panel
  // mounted, no queries kept alive.
  const [lingering, setLingering] = useState<ContextualTab | undefined>(tab);

  // Adjusting state while rendering, React's own answer to "derive from a prop
  // and keep it": the new panel has to be in hand on this render, not the next.
  if (tab && tab !== lingering) setLingering(tab);

  useEffect(() => {
    if (tab) return;

    const timer = window.setTimeout(() => setLingering(undefined), CLOSE_MS);
    return () => window.clearTimeout(timer);
  }, [tab]);

  // Taken from the store first, so an opening panel is drawn on the very render
  // its width starts growing rather than a frame later.
  const shown = tab ?? lingering;

  // Escape closes the bar, the way it dismisses every other transient surface
  // in the app. Bound while open only, so it does not shadow the composer's own
  // Escape — which cancels an edit — when there is nothing to close.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;

      // A panel with a modal confirmation on top of it owns Escape first.
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      close();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  // The element itself stays mounted even with nothing to show: a width that
  // animates needs something to animate from, and a bar that appears at its
  // final width on mount would open with a jump.
  const bounds = contextualBarBounds(layoutWidth(viewportWidth, serverRailWidth), sidebarOpen ? sidebarWidth : 0);
  const Icon = shown ? Icons[ICON_BY_TAB[shown.id]] : null;

  const title = !shown
    ? undefined
    : shown.id === 'members' && room
      ? t('bar.title.membersCount', { count: room.membersCount })
      : t(`bar.title.${shown.id}`);

  return (
    <aside
      // Nothing to size while it is floating: it covers the conversation it is
      // a sibling of, and a width here would take that space twice over.
      //
      // It does reach back past its own left edge, though. The panel is a child
      // of the conversation, which starts after the collapsed room list — and a
      // panel that stops at that seam leaves a 64px strip of nothing beside it
      // on a phone. The negative offset spends that strip too, so the only
      // thing still showing is the server rail.
      style={overlay ? { left: -SIDEBAR_RAIL_WIDTH } : { width: open ? width : 0 }}
      aria-label={title}
      className={cn(
        'bg-panel border-line h-full',
        overlay
          ? // Over the room rather than beside it, filling the space the
            // conversation had. It fades instead of sliding its width, since
            // there is no width of its own left to animate.
            'absolute inset-y-0 right-0 z-10 shadow-xl transition-opacity duration-200 motion-reduce:transition-none'
          : 'relative shrink-0',
        // No edge once the bar is gone, or every room would keep a stray hairline
        // down its right-hand side. None while floating either — it is covering
        // the room, not dividing it.
        !overlay && shown && 'border-l',
        // Shut, it is still there at full size: these are what keep it off the
        // conversation underneath.
        overlay && !open && 'pointer-events-none opacity-0',
        // Off while dragging, and off entirely for anyone who has asked the
        // system for less motion.
        !overlay && !isResizing && 'transition-[width] duration-200 ease-out motion-reduce:transition-none',
      )}
    >
      {/* Gone while floating: the bar's edge is no longer the conversation's,
          and at that width there is only one size the panel may have. */}
      {open && !overlay ? (
        <ResizeHandle
          axis="x"
          // The handle is on the bar's left edge, so the pane grows as the
          // pointer moves left — against the axis.
          invert
          value={width}
          min={bounds.min}
          max={bounds.max}
          label={t('bar.resize')}
          onResize={setWidth}
          onReset={resetWidth}
          onDragChange={setResizing}
          className="top-0 -left-1"
        />
      ) : null}

      {/*
       * Held at its full width inside a clipping frame, as the sidebar is:
       * re-laying the panel out at every frame would reflow its rows, and long
       * names would visibly re-wrap on the way out.
       */}
      <div className="h-full w-full overflow-hidden">
        {shown ? (
          <div
            inert={!open}
            // Floating, it takes the room's full width rather than the dragged
            // one — 280px of panel and a strip of nothing beside it is not a
            // layout anybody chose.
            style={overlay ? undefined : { width }}
            className={cn(
              'flex h-full flex-col',
              overlay
                ? 'w-full'
                : // The aside itself fades in the floating case, so fading this
                  // as well would run the animation twice over.
                  cn(
                    'transition-opacity duration-200 motion-reduce:transition-none',
                    open ? 'opacity-100' : 'opacity-0',
                  ),
            )}
          >
            <header className="border-line flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
              {stack.length > 1 ? (
                <button
                  type="button"
                  aria-label={tCommon('action.back')}
                  onClick={back}
                  className="text-content-muted hover:bg-sunken hover:text-content -ml-1 shrink-0 rounded-md p-1 transition-colors"
                >
                  <Icons.back size={18} />
                </button>
              ) : (
                Icon && <Icon size={18} className="text-content-muted shrink-0" />
              )}

              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-semibold">{title}</h2>
                {shown.id === 'thread' ? (
                  <p className="text-content-muted truncate text-xs">
                    <ThreadSubtitle roomId={roomId} threadId={shown.messageId} />
                  </p>
                ) : null}
              </div>

              <button
                type="button"
                aria-label={tCommon('action.close')}
                onClick={close}
                className="text-content-muted hover:bg-sunken hover:text-content shrink-0 rounded-md p-1 transition-colors"
              >
                <Icons.close size={18} />
              </button>
            </header>

            {/* Keyed on the tab so switching panels starts each one fresh — a search
                term or a half-filled prune form belongs to the panel that owns it. */}
            <Panel
              key={`${shown.id}:${'userId' in shown ? shown.userId : ''}${'messageId' in shown ? shown.messageId : ''}`}
              tab={shown}
              room={room}
              roomId={roomId}
              onOpenRoom={onOpenRoom}
            />
          </div>
        ) : null}
      </div>
    </aside>
  );
};

const Panel = ({
  tab,
  room,
  roomId,
  onOpenRoom,
}: {
  tab: ContextualTab;
  room: RoomSummary | undefined;
  roomId: string;
  onOpenRoom: (roomId: string) => void;
}) => {
  const back = useContextualBarStore((state) => state.back);

  switch (tab.id) {
    case 'room-info':
      return <RoomInfoPanel room={room} roomId={roomId} />;
    case 'room-edit':
      return room ? <RoomEditForm room={room} onDone={back} /> : null;
    case 'members':
      return <MembersPanel room={room} roomId={roomId} />;
    case 'add-members':
      return <AddMembersPanel roomId={roomId} />;
    case 'user-info':
      return <UserInfoPanel userId={tab.userId} room={room} roomId={roomId} onOpenRoom={onOpenRoom} />;
    case 'files':
      return <FilesPanel roomId={roomId} />;
    case 'pinned':
    case 'starred':
    case 'mentions':
      return <MessageCollectionPanel kind={tab.id} room={room} roomId={roomId} />;
    case 'threads':
      return <ThreadsPanel roomId={roomId} />;
    case 'thread':
      return <ThreadPanel roomId={roomId} threadId={tab.messageId} onOpenRoom={onOpenRoom} />;
    case 'search':
      return <SearchPanel roomId={roomId} initialTerm={tab.term} initialScrollTop={tab.scrollTop} />;
    case 'notifications':
      return <NotificationsPanel roomId={roomId} />;
    case 'prune':
      return <PrunePanel room={room} roomId={roomId} />;
    case 'shortcuts':
      return <ShortcutsPanel />;
  }
};

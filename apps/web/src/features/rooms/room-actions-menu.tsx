import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { canEditRoom, canFavoriteRooms, canLeaveRoom, useCapabilities } from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { Icons } from '@/ui/icon';
import { LeaveRoomConfirm } from './leave-room-confirm';
import { useRoomDrawerStore } from './room-drawer-store';
import { useHideRoom, useLeaveRoom, useMarkRoomUnread } from './use-room-actions';
import { useMarkRoomRead, useToggleFavorite } from './use-rooms';

const itemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-sunken';

/**
 * Per-room actions, matching what Rocket.Chat offers on hover.
 *
 * Built on Radix's dropdown rather than a bare popover so it behaves like a
 * menu: arrow-key navigation, type-ahead, Escape to dismiss, and focus
 * returned to the trigger on close.
 */
export const RoomActionsMenu = ({ room, className }: { room: RoomSummary; className?: string }) => {
  const { t } = useTranslation('rooms');

  const hide = useHideRoom();
  const leave = useLeaveRoom();
  const markUnread = useMarkRoomUnread();
  const markRead = useMarkRoomRead();
  const toggleFavorite = useToggleFavorite();
  const openDrawer = useRoomDrawerStore((state) => state.openRoomDrawer);
  const { data: capabilities } = useCapabilities();

  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const isUnread = room.unreadCount > 0 || room.hasUnreadActivity;
  const canFavorite = canFavoriteRooms(capabilities);
  const canLeave = canLeaveRoom(capabilities, room);

  return (
    <>
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button
            type="button"
            aria-label={t('menu.label', { name: room.displayName })}
            // Stops the click from also selecting the room underneath.
            onClick={(event) => event.stopPropagation()}
            className={cn('hover:bg-line/60 rounded p-1 transition-colors data-[state=open]:opacity-100', className)}
          >
            <Icons.more size={16} />
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="start"
            sideOffset={4}
            className="bg-panel border-line z-30 min-w-48 rounded-lg border p-1 shadow-lg"
          >
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => (isUnread ? markRead.mutate(room.id) : markUnread.mutate(room.id))}
            >
              <Icons.mention size={16} className="text-content-muted" />
              {isUnread ? t('menu.markRead') : t('menu.markUnread')}
            </DropdownMenu.Item>

            {canFavorite ? (
              <DropdownMenu.Item
                className={itemClass}
                onSelect={() => toggleFavorite.mutate({ roomId: room.id, favorite: !room.favorite })}
              >
                <Icons.star
                  size={16}
                  weight={room.favorite ? 'fill' : 'light'}
                  className={room.favorite ? 'text-warning' : 'text-content-muted'}
                />
                {room.favorite ? t('menu.unfavorite') : t('menu.favorite')}
              </DropdownMenu.Item>
            ) : null}

            <DropdownMenu.Item className={itemClass} onSelect={() => hide.mutate(room.id)}>
              <Icons.mute size={16} className="text-content-muted" />
              {t('menu.hide')}
            </DropdownMenu.Item>

            {room.type !== 'direct' && canEditRoom(capabilities, room) ? (
              <DropdownMenu.Item className={itemClass} onSelect={() => openDrawer({ mode: 'edit', roomId: room.id })}>
                <Icons.edit size={16} className="text-content-muted" />
                {t('menu.edit')}
              </DropdownMenu.Item>
            ) : null}

            {canLeave ? (
              <>
                <DropdownMenu.Separator className="bg-line my-1 h-px" />
                <DropdownMenu.Item
                  className={cn(itemClass, 'text-danger data-[highlighted]:bg-danger/10')}
                  // Leaving is not undoable without an invitation back, so it is
                  // the one action here that asks first.
                  onSelect={() => setConfirmingLeave(true)}
                >
                  <Icons.leave size={16} />
                  {t('menu.leave')}
                </DropdownMenu.Item>
              </>
            ) : null}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>

      <LeaveRoomConfirm
        open={confirmingLeave}
        onOpenChange={setConfirmingLeave}
        roomName={room.displayName}
        pending={leave.isPending}
        onConfirm={() => {
          leave.mutate(room.id);
          setConfirmingLeave(false);
        }}
      />
    </>
  );
};

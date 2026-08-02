import type { RoomSummary } from '@open-rocket-chat/client-sdk';
import * as Popover from '@radix-ui/react-popover';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { useClient, useServerKeys } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { useRooms } from './use-rooms';

/**
 * The room a `#mention` names, at a glance.
 *
 * The counterpart of {@link UserCard}: a name in a message body is a thing you
 * should be able to look at before deciding to go there. What it can show
 * depends on where the room is — one you are in is already in the sidebar's
 * cache, and one you are not has to be asked for, which a server is entitled to
 * refuse.
 */
export const RoomCard = ({
  roomId,
  name,
  onOpenRoom,
  children,
  className,
}: {
  /** Absent when the message named a room the server did not resolve. */
  roomId?: string;
  /** The name as it was written after the `#`. */
  name: string;
  onOpenRoom?: (roomId: string) => void;
  children: ReactNode;
  className?: string;
}) => {
  const { t } = useTranslation('rooms');
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('roomCard.open', { name })}
          className={cn('focus-visible:ring-accent rounded outline-none focus-visible:ring-2', className)}
        >
          {children}
        </button>
      </Popover.Trigger>

      {/* Portalled for the same reason the user card is: a timeline row is its
          own stacking context, and a card rendered inline would be clipped. */}
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="bg-panel border-line z-50 w-64 rounded-xl border shadow-lg outline-none"
        >
          {/* Mounted only while open, so a timeline full of `#room` costs
              nothing until one is actually asked about. */}
          <RoomCardBody roomId={roomId} name={name} onOpenRoom={onOpenRoom} onDone={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const RoomCardBody = ({
  roomId,
  name,
  onOpenRoom,
  onDone,
}: {
  roomId?: string;
  name: string;
  onOpenRoom?: (roomId: string) => void;
  onDone: () => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');
  const client = useClient();
  const keys = useServerKeys();

  const { data: rooms } = useRooms(true);
  // Matched by id when the server resolved one, and by name otherwise — which
  // is the only handle a room topic or a composer preview can offer.
  const joined = (rooms ?? []).find((room) => (roomId ? room.id === roomId : room.name === name));

  // Only for rooms the reader is not in: everything about a joined room is
  // already in the list above, and asking again would be a request per glance.
  const {
    data: fetched,
    isPending,
    error,
  } = useQuery({
    queryKey: keys.room(roomId ?? ''),
    queryFn: () => client.rooms.get(roomId as string),
    enabled: Boolean(roomId) && !joined,
    staleTime: 60_000,
  });

  const room: RoomSummary | undefined = joined ?? (fetched as RoomSummary | undefined);

  if (!room && isPending && roomId && !joined) {
    return (
      <p className="text-content-muted flex items-center justify-center gap-2 py-8 text-sm">
        <Spinner className="size-4" /> {tCommon('state.loading')}
      </p>
    );
  }

  // A room that cannot be read is still worth acknowledging: the name was in
  // the message, and silence would read as the card being broken.
  if (!room) {
    return (
      <div className="px-4 py-6 text-center">
        <p className="text-sm font-semibold break-words">#{name}</p>
        <p className="text-content-muted mt-1 text-xs">{error ? t('roomCard.unavailable') : t('roomCard.notFound')}</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center px-4 pt-4 text-center">
        <Avatar name={room.displayName} src={room.avatarUrl} size="xl" />

        <p className="mt-2.5 text-sm font-semibold break-words">{room.displayName}</p>
        <p className="text-content-muted flex items-center justify-center gap-1 text-xs">
          {room.type === 'channel' ? <Icons.channel size={12} /> : <Icons.private size={12} />}
          {t(`type.${room.type}`)}
        </p>

        {room.topic ? (
          <p className="text-content-secondary mt-1.5 line-clamp-2 text-xs break-words">{room.topic}</p>
        ) : null}

        <p className="text-content-muted mt-1.5 text-[11px]">{t('roomCard.members', { count: room.membersCount })}</p>
      </div>

      <div className="border-line mt-3 flex border-t">
        {onOpenRoom ? (
          <button
            type="button"
            onClick={() => {
              onOpenRoom(room.id);
              onDone();
            }}
            className="text-content-secondary hover:bg-sunken hover:text-content flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-b-xl px-2 py-2.5 text-xs transition-colors"
          >
            <Icons.chevronRight size={16} />
            {/* Joining is Rocket.Chat's business, not this card's: opening a
                public room you are not in is a read, and the room view says so
                if the server disagrees. */}
            <span className="truncate">{joined ? t('roomCard.go') : t('roomCard.preview')}</span>
          </button>
        ) : null}
      </div>
    </>
  );
};

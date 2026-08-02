import type { RoomSummary, UserSummary } from '@open-rocket-chat/client-sdk';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useTranslation } from 'react-i18next';

import { MessageBody } from '@/features/messages/message-body';
import { canFavoriteRooms, useCapabilities } from '@/features/server/use-capabilities';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui-store';
import { Avatar } from '@/ui/avatar';
import { Icons } from '@/ui/icon';
import { useContextualBarStore } from './contextual-bar/store';
import { useRoomToolboxActions, VISIBLE_TOOLBOX_ACTIONS, VISIBLE_TOOLBOX_ACTIONS_NARROW } from './contextual-bar/tabs';
import { UserCard } from './user-card';
import { useToggleFavorite } from './use-rooms';

/** How many member avatars fit before the overflow count takes over. */
const AVATAR_STACK_LIMIT = 4;

/**
 * Largest overflow the badge spells out. Past this it reads "+99", because a
 * four-character count would widen the stack and nobody reads "+1247" as
 * anything more precise than "a lot".
 */
const AVATAR_OVERFLOW_LIMIT = 99;

/**
 * The shape every tile in the stack shares — member avatars and the overflow
 * count alike. Ringed so overlapping tiles stay distinguishable, and never
 * allowed to shrink: as a flex item the count would otherwise squeeze down to
 * the width of its own text and stop being a square.
 */
const stackTileClass = 'ring-app shrink-0 rounded-lg ring-2';

/**
 * Matches `Avatar`'s `sm` box exactly — same square, same type size — so the
 * count reads as one more tile in the stack rather than a chip beside it. It is
 * positioned only to sit above the avatar it overlaps rather than under it.
 */
const overflowBadgeClass =
  'bg-sunken text-content-muted relative -ml-2 flex size-7 items-center justify-center text-[10px] font-semibold';

/**
 * The topic gets the same parser as a message, but only one line to say it in.
 *
 * So everything the parser can emit is flattened onto that line: margins off,
 * headings back down to the surrounding size, and the paragraph ellipsed the
 * way the plain text it replaced used to be. Anything taller — a list, a code
 * fence — is clipped by the fixed height rather than allowed to grow the
 * header.
 */
const TOPIC_PROSE =
  'h-4 overflow-hidden text-xs leading-4 [&_*]:my-0! [&_h1]:text-xs [&_h2]:text-xs [&_h3]:text-xs [&_p]:truncate';

const HeaderButton = ({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      'flex size-9 items-center justify-center rounded-lg transition-colors',
      active ? 'bg-sunken text-content' : 'text-content-muted hover:bg-sunken hover:text-content',
    )}
  >
    {children}
  </button>
);

const menuItemClass =
  'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-sm outline-none transition-colors data-[highlighted]:bg-sunken';

export const RoomHeader = ({
  room,
  members,
  onOpenRoom,
}: {
  room: RoomSummary | undefined;
  members: UserSummary[];
  onOpenRoom: (roomId: string) => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const toggleFavorite = useToggleFavorite();
  const { data: capabilities } = useCapabilities();
  const viewportIsMobile = useUiStore((state) => state.viewportIsMobile);
  const toggleTab = useContextualBarStore((state) => state.toggle);
  const openTab = useContextualBarStore((state) => state.open);
  const stack = useContextualBarStore((state) => state.stack);
  const actions = useRoomToolboxActions(room);

  const rootTabId = stack[0]?.id;

  // The mark beside the name follows the sidebar and the info panel: the peer's
  // picture in a direct message, the room's own where it has one, and the type
  // icon only when there is no picture to show instead.
  const peer = room?.type === 'direct' ? room.directMembers[0] : undefined;

  const visible = members.slice(0, AVATAR_STACK_LIMIT);
  const overflow = Math.max(0, (room?.membersCount ?? 0) - visible.length);
  const overflowLabel = `+${Math.min(overflow, AVATAR_OVERFLOW_LIMIT)}`;

  // The badge only opens the panel the toolbox itself offers — in a direct
  // message, or when the server hides the member list, there is nothing to open.
  const canOpenMembers = actions.some((action) => action.id === 'members');

  // Rocket.Chat shows the first few and folds the rest into a menu, so the
  // toolbar stays a fixed width whatever the server has enabled. On a phone the
  // whole toolbox folds — see `VISIBLE_TOOLBOX_ACTIONS_NARROW`.
  const limit = viewportIsMobile ? VISIBLE_TOOLBOX_ACTIONS_NARROW : VISIBLE_TOOLBOX_ACTIONS;
  const shown = actions.slice(0, limit);
  const hidden = actions.slice(limit);

  return (
    <header className="border-line bg-app flex items-center gap-3 border-b px-4 py-2.5">
      <div className="flex min-w-0 items-center gap-3">
        {/* The icon repeats the name's target for the mouse. It is hidden from
            assistive technology and out of the tab order so it does not
            announce the same room twice. */}
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={() => toggleTab({ id: 'room-info' })}
          className={cn(
            'flex size-9 shrink-0 items-center justify-center rounded-lg',
            // The tinted square is the icon's backing, not the avatar's: an
            // avatar brings its own box and would sit on a coloured border.
            !peer && !room?.avatarUrl && 'bg-accent text-accent-content',
          )}
        >
          {peer ? (
            <Avatar name={peer.displayName} src={peer.avatarUrl} size="md" status={peer.status} />
          ) : room?.avatarUrl ? (
            <Avatar name={room.displayName} src={room.avatarUrl} size="md" />
          ) : room?.type === 'direct' ? (
            <Icons.direct size={18} />
          ) : room?.type === 'channel' || !room ? (
            <Icons.channel size={18} />
          ) : (
            <Icons.private size={18} />
          )}
        </button>

        <div className="min-w-0">
          {/* The star sits beside the name rather than out at the end of the
              header: it is a property of the room being named, and read that way
              only while it is next to what it applies to. Its own button, since
              an anchor-like control cannot be nested in the one that opens the
              info panel. */}
          <div className="flex min-w-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => toggleTab({ id: 'room-info' })}
              className="flex min-w-0 items-center gap-1.5 rounded-lg text-left"
            >
              <h1 className="truncate text-sm font-semibold">{room?.displayName ?? tCommon('state.loading')}</h1>
              <Icons.chevronDown size={14} className="text-content-muted shrink-0" />
            </button>

            {room && canFavoriteRooms(capabilities) ? (
              <button
                type="button"
                aria-label={room.favorite ? t('action.unfavorite') : t('action.favorite')}
                title={room.favorite ? t('action.unfavorite') : t('action.favorite')}
                aria-pressed={room.favorite}
                onClick={() => toggleFavorite.mutate({ roomId: room.id, favorite: !room.favorite })}
                className="shrink-0 rounded p-0.5 transition-colors"
              >
                <Icons.star
                  size={16}
                  weight={room.favorite ? 'fill' : 'light'}
                  className={room.favorite ? 'text-warning' : 'text-content-muted hover:text-content'}
                />
              </button>
            ) : null}
          </div>

          {/* Formatted, so a link or `code` in the topic reads here the way it
              does in the timeline — and outside the button above, because an
              anchor nested in one is neither valid nor clickable. */}
          {room?.topic || room?.description ? (
            <MessageBody text={room.topic || room.description!} className={cn('text-content-muted', TOPIC_PROSE)} />
          ) : null}
        </div>
      </div>

      <div className="ml-auto flex items-center gap-1">
        {visible.length > 0 ? (
          <div className="mr-2 hidden items-center sm:flex">
            {/* Each tile wraps in a `flex` span rather than the default inline
                flow: an inline avatar leaves room for a descender beneath it,
                which makes the wrapper taller than the tile it holds and drops
                the neighbouring count off-centre. */}
            {visible.map((member, index) => (
              <span key={member.id} className={cn('flex shrink-0', index > 0 && '-ml-2')} title={member.displayName}>
                {/* The stack sits at the top-right, so its cards open below and
                    are aligned to their right edge rather than off-screen. */}
                <UserCard
                  userId={member.id}
                  name={member.displayName}
                  onOpenRoom={onOpenRoom}
                  side="bottom"
                  align="end"
                >
                  <Avatar name={member.displayName} src={member.avatarUrl} size="sm" className={stackTileClass} />
                </UserCard>
              </span>
            ))}
            {overflow > 0 ? (
              canOpenMembers ? (
                <button
                  type="button"
                  aria-label={t('info.viewAllMembers')}
                  title={t('info.viewAllMembers')}
                  onClick={() => openTab({ id: 'members' })}
                  className={cn(
                    stackTileClass,
                    overflowBadgeClass,
                    'hover:bg-line hover:text-content transition-colors',
                  )}
                >
                  {overflowLabel}
                </button>
              ) : (
                <span className={cn(stackTileClass, overflowBadgeClass)}>{overflowLabel}</span>
              )
            ) : null}
          </div>
        ) : null}

        {shown.map((action) => {
          const Icon = Icons[action.icon];
          return (
            <HeaderButton
              key={action.id}
              label={t(`bar.title.${action.id}`)}
              active={rootTabId === action.id}
              onClick={() => toggleTab(action.tab)}
            >
              <Icon size={18} />
            </HeaderButton>
          );
        })}

        {hidden.length > 0 ? (
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                aria-label={tCommon('action.more')}
                title={tCommon('action.more')}
                className="text-content-muted hover:bg-sunken hover:text-content flex size-9 items-center justify-center rounded-lg transition-colors"
              >
                <Icons.more size={18} />
              </button>
            </DropdownMenu.Trigger>

            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={4}
                className="bg-panel border-line z-30 min-w-52 rounded-lg border p-1 shadow-lg"
              >
                {hidden.map((action) => {
                  const Icon = Icons[action.icon];
                  return (
                    <DropdownMenu.Item
                      key={action.id}
                      className={cn(
                        menuItemClass,
                        action.id === 'prune' && 'text-danger data-[highlighted]:bg-danger/10',
                      )}
                      onSelect={() => openTab(action.tab)}
                    >
                      <Icon size={16} className={action.id === 'prune' ? undefined : 'text-content-muted'} />
                      {t(`bar.title.${action.id}`)}
                    </DropdownMenu.Item>
                  );
                })}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        ) : null}
      </div>
    </header>
  );
};

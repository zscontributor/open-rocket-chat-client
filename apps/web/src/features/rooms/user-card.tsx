import * as Popover from '@radix-ui/react-popover';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { showFeatureNotice } from '@/features/server/feature-notice-store';
import { displayNameOf, useCapabilities } from '@/features/server/use-capabilities';
import { useServerConnection } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import { describeError } from '@/lib/errors';
import { Avatar } from '@/ui/avatar';
import { Icons, Spinner } from '@/ui/icon';
import { useContextualBarStore } from './contextual-bar/store';
import { useUserProfile } from './contextual-bar/use-panels';
import { useCanOpenDirectMessage } from './use-rooms';
import { useCreateDirectRoom } from './use-room-actions';

/** Beyond this the chips wrap into a block that dwarfs the card itself. */
const MAX_ROLE_CHIPS = 3;

export interface UserCardProps {
  userId: string;
  /** Only used for the trigger's label; the card itself reads the profile. */
  name: string;
  /** Absent where nothing can open a room — the card then hides its DM action. */
  onOpenRoom?: (roomId: string) => void;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  /** The avatar (or whatever else) the card hangs off. */
  children: ReactNode;
  className?: string;
}

/**
 * Rocket.Chat's user card: a click on an avatar opens a small profile beside it.
 *
 * Deliberately not the contextual bar's `UserInfoPanel` — this is the glance
 * version, and the moderation actions that panel carries need a room, which an
 * avatar in a search result or a header stack cannot supply. "Full profile"
 * hands off to the panel for the rest.
 */
export const UserCard = ({
  userId,
  name,
  onOpenRoom,
  side = 'right',
  align = 'start',
  children,
  className,
}: UserCardProps) => {
  const { t } = useTranslation('rooms');
  // The card is anchored to its trigger, so the popover sits beside whichever
  // avatar was clicked; Radix flips it when the chosen side has no room.
  const [open, setOpen] = useState(false);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label={t('userCard.open', { name })}
          className={cn(
            'focus-visible:ring-accent inline-flex rounded-lg outline-none focus-visible:ring-2',
            className,
          )}
        >
          {children}
        </button>
      </Popover.Trigger>

      {/* Portalled: timeline rows are positioned with a transform, which makes
          each its own stacking context — a card rendered inline would be
          clipped by the row it belongs to and painted under the next one. */}
      <Popover.Portal>
        <Popover.Content
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={12}
          className="bg-panel border-line z-50 w-64 rounded-xl border shadow-lg outline-none"
        >
          {/* Mounted only while open, so a room full of avatars costs no
              profile requests until one is actually asked for. */}
          <UserCardBody userId={userId} onOpenRoom={onOpenRoom} onDone={() => setOpen(false)} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
};

const UserCardBody = ({
  userId,
  onOpenRoom,
  onDone,
}: {
  userId: string;
  onOpenRoom?: (roomId: string) => void;
  onDone: () => void;
}) => {
  const { t } = useTranslation('rooms');
  const { t: tCommon } = useTranslation('common');

  const connection = useServerConnection();
  const { data: capabilities } = useCapabilities();
  const { data: profile, isPending, error } = useUserProfile(userId);

  const openTab = useContextualBarStore((state) => state.open);
  const createDirect = useCreateDirectRoom();
  const canOpenDirect = useCanOpenDirectMessage(profile?.username);

  if (isPending) {
    return (
      <p className="text-content-muted flex items-center justify-center gap-2 py-8 text-sm">
        <Spinner className="size-4" /> {tCommon('state.loading')}
      </p>
    );
  }

  if (error || !profile) {
    return (
      <p role="alert" className="text-danger px-4 py-8 text-center text-sm">
        {describeError(error)}
      </p>
    );
  }

  const name = displayNameOf(capabilities, profile);
  const isSelf = profile.id === connection.user.id;
  const roles = profile.roles.slice(0, MAX_ROLE_CHIPS);

  return (
    <>
      <div className="flex flex-col items-center px-4 pt-4 text-center">
        <Avatar name={name} src={profile.avatarUrl} size="xl" status={profile.status} />

        <p className="mt-2.5 text-sm font-semibold break-words">{name}</p>
        <p className="text-content-muted text-xs">@{profile.username}</p>

        {profile.status ? (
          <p className="text-content-secondary mt-1 text-xs">{tCommon(`presence.${profile.status}`)}</p>
        ) : null}

        {profile.statusText ? (
          <p className="text-content-secondary mt-1 line-clamp-2 text-xs break-words">{profile.statusText}</p>
        ) : null}

        {roles.length > 0 ? (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {roles.map((role) => (
              <span key={role} className="bg-sunken text-content-secondary rounded px-1.5 py-0.5 text-[10px]">
                {role}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="border-line mt-3 flex border-t">
        {!isSelf && onOpenRoom ? (
          <CardAction
            label={t('userInfo.message')}
            icon={<Icons.direct size={16} />}
            disabled={createDirect.isPending}
            onClick={() => {
              // Left on screen when the server withholds `create-d`, so the
              // refusal is explained rather than looking like a missing action.
              if (canOpenDirect === false) {
                showFeatureNotice('createDirect');
                return;
              }

              createDirect.mutate(profile.username, {
                onSuccess: (created) => {
                  onOpenRoom(created.id);
                  onDone();
                },
              });
            }}
          />
        ) : null}

        <CardAction
          label={t('userCard.viewProfile')}
          icon={<Icons.info size={16} />}
          onClick={() => {
            // Replaces whatever the bar was showing: the card is a jump to this
            // person, not a drill-down from the panel underneath it.
            openTab({ id: 'user-info', userId: profile.id });
            onDone();
          }}
        />
      </div>
    </>
  );
};

const CardAction = ({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: ReactNode;
  disabled?: boolean;
  onClick: () => void;
}) => (
  <button
    type="button"
    disabled={disabled}
    onClick={onClick}
    // `min-w-0` so a long label truncates rather than widening the card.
    className="text-content-secondary hover:bg-sunken hover:text-content flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-b-xl px-2 py-2.5 text-xs transition-colors disabled:opacity-50"
  >
    {icon}
    <span className="truncate">{label}</span>
  </button>
);

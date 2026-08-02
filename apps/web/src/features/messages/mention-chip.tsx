import { useTranslation } from 'react-i18next';

import { RoomCard } from '@/features/rooms/room-card';
import { UserCard } from '@/features/rooms/user-card';
import { useServerConnection } from '@/features/servers/server-scope';
import { cn } from '@/lib/cn';
import type { MentionKind } from './mentions';

/**
 * Shared by every kind so a mention reads as one thing wherever it lands, and
 * so the two that open a card line up with the two that do not.
 */
const CHIP = 'rounded px-1 py-px font-medium';

/**
 * A `@somebody` or `#some-room` in a message body.
 *
 * Users and rooms open the same cards the rest of the app uses — an avatar in
 * the timeline and a name in a message should not lead to two different views
 * of the same person. `@all` and `@here` are styled but inert: they name a room
 * full of people, and there is nothing to look up.
 */
export const MentionChip = ({
  kind,
  name,
  id,
  onOpenRoom,
}: {
  kind: MentionKind;
  name: string;
  id?: string;
  onOpenRoom?: (roomId: string) => void;
}) => {
  const { t } = useTranslation('messages');
  const { user } = useServerConnection();

  if (kind === 'channel') {
    return (
      <RoomCard roomId={id} name={name} onOpenRoom={onOpenRoom} className="align-baseline">
        <span className={cn(CHIP, 'text-link hover:bg-sunken')}>#{name}</span>
      </RoomCard>
    );
  }

  if (kind === 'all' || kind === 'here') {
    return (
      <span className={cn(CHIP, 'bg-accent-subtle text-accent')} title={t(`mention.${kind}`)}>
        @{name}
      </span>
    );
  }

  // Being the one mentioned is the whole point of a mention, so it is marked
  // out rather than left to look like every other name in the room.
  const isMe = name.toLowerCase() === user.username.toLowerCase();

  return (
    <UserCard
      userId={id ?? name}
      name={name}
      onOpenRoom={onOpenRoom}
      side="top"
      align="start"
      className="align-baseline"
    >
      <span className={cn(CHIP, isMe ? 'bg-accent text-accent-content' : 'text-link hover:bg-sunken')}>@{name}</span>
    </UserCard>
  );
};

import { formatUnreadCount } from '@/features/rooms/unread';
import { cn } from '@/lib/cn';

export interface UnreadBadgeProps {
  count: number;
  /** Mentions colour the badge; they never replace the number on it. */
  mention?: boolean;
  /** Set on the selected room, whose row is already filled with the accent. */
  onSelectedRow?: boolean;
  /** The sentence a screen reader hears in place of the bare number. */
  label: string;
  className?: string;
}

/**
 * The unread count on a room row.
 *
 * Every variant is a filled pill rather than a tinted one. A badge drawn in
 * `sunken` on a `sidebar` background is invisible in a dark theme — those two
 * surfaces are three points apart by design — and an unread count nobody can
 * see is the same as no unread count.
 */
export const UnreadBadge = ({ count, mention, onSelectedRow, label, className }: UnreadBadgeProps) => (
  <span
    // Announced when it changes, as Rocket.Chat's own badge is: a message
    // arriving in another room is worth hearing about without going to look.
    role="status"
    title={label}
    aria-label={label}
    className={cn(
      'flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] leading-none font-semibold',
      mention
        ? // `text-app` rather than white: the danger colour is a light salmon in
          // dark themes, where white text on it cannot be read.
          'bg-danger text-app'
        : onSelectedRow
          ? 'bg-black/25 text-content-inverted'
          : 'bg-line-strong text-content',
      className,
    )}
  >
    {/* The label above already says all of this, at length. */}
    <span aria-hidden>{formatUnreadCount(count)}</span>
  </span>
);
